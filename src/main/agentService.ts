import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, type WebContents } from 'electron';
import {
	query,
	type CanUseTool,
	type PermissionResult,
	type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import {
	appendMessage,
	DEFAULT_CHAT_ID,
	getSessionId,
	setSessionId,
} from './chatService';
import { getFolder } from './folderService';
import { IpcChannels, type AgentEvent, type PermissionResponse } from './ipc';
import {
	isReadOnlyBashCommand,
	isSafeBashWrite,
	shouldAutoAllowStructuredFileTool,
} from './permissions';
import { loadPromptWithFolder } from './prompts';

function resolveClaudeCodeBinary(): string {
	// Packaged (via extraResource in forge.config.ts): the binary's package
	// directory is copied verbatim into Contents/Resources.
	// Dev: the optional dep lives under the source tree's node_modules.
	const pkgDir = `claude-agent-sdk-${ process.platform }-${ process.arch }`;
	const packaged = path.join( process.resourcesPath, pkgDir, 'claude' );
	const dev = path.join(
		app.getAppPath(),
		'node_modules',
		'@anthropic-ai',
		pkgDir,
		'claude'
	);
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error( `Claude Code binary not found at ${ candidate }` );
	}
	fs.accessSync( candidate, fs.constants.X_OK );
	return candidate;
}

function resolveBundledSettingsPath(): string {
	const packaged = path.join( process.resourcesPath, 'claude-defaults.json' );
	const dev = path.join(
		app.getAppPath(),
		'resources',
		'claude-defaults.json'
	);
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error(
			`Bundled claude-defaults.json not found at ${ candidate }`
		);
	}
	return candidate;
}

export function resolveBundledPromptPath( name: string ): string {
	const packaged = path.join( process.resourcesPath, 'prompts', name );
	const dev = path.join( app.getAppPath(), 'resources', 'prompts', name );
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error( `Bundled prompt not found at ${ candidate }` );
	}
	return candidate;
}

type UnstampedEvent = AgentEvent extends infer T
	? T extends { folderId: string }
		? Omit< T, 'folderId' >
		: never
	: never;

type PendingPermission = {
	resolve: ( decision: PermissionResponse ) => void;
	reject: ( err: Error ) => void;
};

export class AgentService {
	private readonly sessionsByChat = new Map< string, string >();
	private currentChatId: string = DEFAULT_CHAT_ID;
	private readonly binaryPath: string;
	private readonly bundledSettingsPath: string;
	private readonly pendingPermissions = new Map<
		string,
		PendingPermission
	>();
	private readonly allowForSession = new Set< string >();
	// Accumulates input_json_delta chunks per tool_use block while they stream.
	private readonly partialToolInputs = new Map< string, string >();
	// Tool calls keyed by tool_use id; populated when the assistant emits
	// tool_use, consumed when the matching tool_result arrives so the
	// persisted log line can carry the tool name + input.
	private readonly pendingToolCalls = new Map<
		string,
		{ toolName: string; input: unknown }
	>();

	constructor(
		private readonly webContents: WebContents,
		public readonly folderId: string
	) {
		this.binaryPath = resolveClaudeCodeBinary();
		this.bundledSettingsPath = resolveBundledSettingsPath();
	}

	async send(
		prompt: string,
		chatId: string = DEFAULT_CHAT_ID
	): Promise< void > {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			this.emit( {
				kind: 'error',
				message: 'ANTHROPIC_API_KEY is not set',
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}

		const folder = getFolder( this.folderId );
		if ( ! folder ) {
			this.emit( {
				kind: 'error',
				message: `Folder ${ this.folderId } is not linked.`,
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}
		if ( ! fs.existsSync( folder.path ) ) {
			this.emit( {
				kind: 'error',
				message: `Folder no longer exists on disk: ${ folder.path }`,
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}

		this.currentChatId = chatId;

		// Hydrate session id from disk on first send for this chat after
		// restart.
		if ( ! this.sessionsByChat.has( chatId ) ) {
			const persisted = getSessionId( this.folderId, chatId );
			if ( persisted ) {
				this.sessionsByChat.set( chatId, persisted );
			}
		}

		appendMessage( this.folderId, chatId, {
			kind: 'user',
			id: randomUUID(),
			text: prompt,
			at: Date.now(),
		} );

		const writingPrompt = loadPromptWithFolder(
			resolveBundledPromptPath( 'writing-assistant.txt' ),
			folder.path
		);

		const q = query( {
			prompt,
			options: {
				cwd: folder.path,
				env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
				pathToClaudeCodeExecutable: this.binaryPath,
				settings: this.bundledSettingsPath,
				settingSources: [ 'user', 'project', 'local' ],
				permissionMode: 'default',
				canUseTool: this.canUseTool,
				includePartialMessages: true,
				resume: this.sessionsByChat.get( chatId ) ?? undefined,
				systemPrompt: {
					type: 'preset',
					preset: 'claude_code',
					append: writingPrompt,
				},
			},
		} );

		try {
			for await ( const msg of q ) {
				this.handleMessage( msg );
			}
		} catch ( err ) {
			this.emit( {
				kind: 'error',
				message: err instanceof Error ? err.message : String( err ),
			} );
			this.emit( { kind: 'done', success: false } );
		} finally {
			// Resolve any lingering permission prompts so the UI unblocks.
			for ( const pending of this.pendingPermissions.values() ) {
				pending.reject( new Error( 'Run ended before decision.' ) );
			}
			this.pendingPermissions.clear();
			this.partialToolInputs.clear();
			this.pendingToolCalls.clear();
		}
	}

	respondToPermission( response: PermissionResponse ): void {
		const pending = this.pendingPermissions.get( response.requestId );
		if ( ! pending ) {
			return;
		}
		this.pendingPermissions.delete( response.requestId );
		pending.resolve( response );
	}

	private readonly canUseTool: CanUseTool = async (
		toolName,
		input
	): Promise< PermissionResult > => {
		if ( this.allowForSession.has( toolName ) ) {
			return { behavior: 'allow', updatedInput: input };
		}
		const folder = getFolder( this.folderId );
		if (
			folder &&
			shouldAutoAllowStructuredFileTool( toolName, input, folder.path )
		) {
			return { behavior: 'allow', updatedInput: input };
		}
		if (
			toolName === 'Bash' &&
			typeof input === 'object' &&
			input !== null
		) {
			const command = ( input as { command?: unknown } )
				.command as string;
			if ( isReadOnlyBashCommand( command ) ) {
				return { behavior: 'allow', updatedInput: input };
			}
			if ( folder && isSafeBashWrite( command, folder.path ) ) {
				return { behavior: 'allow', updatedInput: input };
			}
		}
		const requestId = randomUUID();
		let decision: PermissionResponse;
		try {
			decision = await new Promise< PermissionResponse >(
				( resolve, reject ) => {
					this.pendingPermissions.set( requestId, {
						resolve,
						reject,
					} );
					this.emit( {
						kind: 'permission-request',
						requestId,
						toolName,
						input,
					} );
				}
			);
		} catch ( err ) {
			return {
				behavior: 'deny',
				message: err instanceof Error ? err.message : String( err ),
			};
		}
		if ( decision.decision === 'deny' ) {
			return {
				behavior: 'deny',
				message: 'User denied this operation.',
			};
		}
		if ( decision.remember ) {
			this.allowForSession.add( toolName );
		}
		return { behavior: 'allow', updatedInput: input };
	};

	private handleMessage( msg: SDKMessage ): void {
		switch ( msg.type ) {
			case 'system':
				if ( msg.subtype === 'init' ) {
					this.sessionsByChat.set(
						this.currentChatId,
						msg.session_id
					);
					setSessionId(
						this.folderId,
						this.currentChatId,
						msg.session_id
					);
					this.emit( {
						kind: 'init',
						sessionId: msg.session_id,
					} );
				}
				return;

			case 'stream_event': {
				this.handleStreamEvent( msg.event );
				return;
			}

			case 'assistant': {
				const textParts: string[] = [];
				for ( const block of msg.message.content ) {
					if ( block.type === 'tool_use' ) {
						this.pendingToolCalls.set( block.id, {
							toolName: block.name,
							input: block.input,
						} );
						this.emit( {
							kind: 'tool-use-start',
							toolUseId: block.id,
							toolName: block.name,
							input: block.input,
						} );
					} else if (
						block.type === 'text' &&
						typeof block.text === 'string'
					) {
						textParts.push( block.text );
					}
				}
				if ( textParts.length > 0 ) {
					appendMessage( this.folderId, this.currentChatId, {
						kind: 'assistant',
						id: randomUUID(),
						text: textParts.join( '' ),
						at: Date.now(),
					} );
				}
				return;
			}

			case 'user': {
				const content = msg.message.content;
				if ( ! Array.isArray( content ) ) {
					return;
				}
				for ( const block of content ) {
					if (
						typeof block === 'object' &&
						block !== null &&
						( block as { type?: string } ).type === 'tool_result'
					) {
						const typed = block as {
							tool_use_id: string;
							content?:
								| string
								| Array< { type: string; text?: string } >;
							is_error?: boolean;
						};
						const output =
							typeof typed.content === 'string'
								? typed.content
								: ( typed.content ?? [] )
										.filter(
											( c ) =>
												c.type === 'text' &&
												typeof c.text === 'string'
										)
										.map( ( c ) => c.text as string )
										.join( '\n' );
						this.emit( {
							kind: 'tool-result',
							toolUseId: typed.tool_use_id,
							output,
							isError: typed.is_error === true,
						} );
						const call = this.pendingToolCalls.get(
							typed.tool_use_id
						);
						this.pendingToolCalls.delete( typed.tool_use_id );
						appendMessage( this.folderId, this.currentChatId, {
							kind: 'tool',
							id: randomUUID(),
							toolUseId: typed.tool_use_id,
							toolName: call?.toolName ?? 'unknown',
							input: call?.input,
							status: typed.is_error === true ? 'error' : 'done',
							output,
							at: Date.now(),
						} );
					}
				}
				return;
			}

			case 'result': {
				this.emit( {
					kind: 'result',
					costUsd: msg.total_cost_usd ?? 0,
					tokens:
						( msg.usage?.input_tokens ?? 0 ) +
						( msg.usage?.output_tokens ?? 0 ),
					durationMs: msg.duration_ms ?? 0,
					numTurns: msg.num_turns ?? 0,
				} );
				this.emit( {
					kind: 'done',
					success: msg.subtype === 'success',
				} );
			}
		}
	}

	private handleStreamEvent(
		ev: {
			type: string;
			index?: number;
			delta?: { type: string; text?: string; partial_json?: string };
			content_block?: { type: string; id?: string; name?: string };
		} & Record< string, unknown >
	): void {
		if (
			ev.type === 'content_block_delta' &&
			ev.delta?.type === 'text_delta' &&
			typeof ev.delta.text === 'string'
		) {
			this.emit( { kind: 'text-delta', text: ev.delta.text } );
			return;
		}
		// Input-JSON deltas for tool_use are accumulated so we can ignore
		// half-parsed payloads; we emit tool-use-start from the full
		// assistant message instead (see the 'assistant' case).
		if (
			ev.type === 'content_block_delta' &&
			ev.delta?.type === 'input_json_delta' &&
			typeof ev.delta.partial_json === 'string' &&
			typeof ev.index === 'number'
		) {
			const key = String( ev.index );
			this.partialToolInputs.set(
				key,
				( this.partialToolInputs.get( key ) ?? '' ) +
					ev.delta.partial_json
			);
		}
	}

	emitError( err: unknown ): void {
		this.emit( {
			kind: 'error',
			message: err instanceof Error ? err.message : String( err ),
		} );
		this.emit( { kind: 'done', success: false } );
	}

	private emit( event: UnstampedEvent ): void {
		if ( this.webContents.isDestroyed() ) {
			return;
		}
		const stamped = {
			folderId: this.folderId,
			...event,
		} as AgentEvent;
		this.webContents.send( IpcChannels.event, stamped );
	}
}
