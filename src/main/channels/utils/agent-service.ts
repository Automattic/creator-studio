import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { type WebContents } from 'electron';
import {
	query,
	type CanUseTool,
	type PermissionResult,
	type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import {
	chatLogPath,
	DEFAULT_CHAT_ID,
	ensureDir,
	readMetaFile,
	resolveProjectPath,
	touchMeta,
} from './chat-store';
import {
	isReadOnlyBashCommand,
	isSafeBashWrite,
	shouldAutoAllowStructuredFileTool,
} from './permissions';
import { getProject } from './project-get';
import { loadPromptWithProjectPath } from './prompts';
import {
	resolveBundledPromptPath,
	resolveBundledSettingsPath,
	resolveClaudeCodeBinary,
} from './resource-paths';
import { agentOnEvent } from '../agent-on-event';
import {
	type AgentEvent,
	type PermissionResponse,
	type PersistedMessage,
} from '../../../types';

export { DEFAULT_CHAT_ID } from './chat-store';

type UnstampedEvent = AgentEvent extends infer T
	? T extends { projectId: string }
		? Omit< T, 'projectId' >
		: never
	: never;

type PendingPermission = {
	resolve: ( decision: PermissionResponse ) => void;
	reject: ( err: Error ) => void;
};

function appendMessage(
	projectId: string,
	chatId: string,
	message: PersistedMessage
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	const logPath = chatLogPath( projectPath, chatId );
	ensureDir( path.dirname( logPath ) );
	fs.appendFileSync( logPath, JSON.stringify( message ) + '\n', 'utf-8' );
	touchMeta( projectPath, chatId, { lastMessageAt: message.at } );
}

function getSessionId( projectId: string, chatId: string ): string | null {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	const meta = readMetaFile( projectPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.sessionId ?? null;
}

function getChatTitle( projectId: string, chatId: string ): string | undefined {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return undefined;
	}
	const meta = readMetaFile( projectPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.title;
}

async function generateChatTitle(
	apiKey: string,
	userPrompt: string,
	assistantText: string
): Promise< string | null > {
	try {
		const res = await fetch( 'https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify( {
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 32,
				messages: [
					{
						role: 'user',
						content: `Summarize the exchange below as a 3–5 word chat title. Reply with only the title — no quotes, no trailing punctuation, no explanation.\n\nUser: ${ userPrompt.slice(
							0,
							800
						) }\nAssistant: ${ assistantText.slice( 0, 800 ) }`,
					},
				],
			} ),
		} );
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as {
			content?: Array< { type?: string; text?: string } >;
		};
		const text = data.content?.find( ( b ) => b.type === 'text' )?.text;
		if ( ! text ) {
			return null;
		}
		return text
			.trim()
			.replace( /^["'`]+|["'`.!?]+$/g, '' )
			.trim()
			.slice( 0, 60 );
	} catch {
		return null;
	}
}

function setSessionId(
	projectId: string,
	chatId: string,
	sessionId: string
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	touchMeta( projectPath, chatId, { sessionId } );
}

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
	// Per-turn state used to auto-title the chat after the first successful
	// exchange when the chat still has no user-set title.
	private currentTurn: {
		userPrompt: string;
		assistantText: string;
		shouldAutoTitle: boolean;
	} | null = null;

	constructor(
		private readonly webContents: WebContents,
		public readonly projectId: string
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

		const project = getProject( this.projectId );
		if ( ! project ) {
			this.emit( {
				kind: 'error',
				message: `Project ${ this.projectId } is not linked.`,
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}
		if ( ! fs.existsSync( project.path ) ) {
			this.emit( {
				kind: 'error',
				message: `Project folder no longer exists on disk: ${ project.path }`,
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}

		this.currentChatId = chatId;

		// Capture per-turn state so we can auto-title the chat after this
		// run if it still has no title. Only flag the first turn — once the
		// chat has a session, later runs skip the title pass.
		const existingTitle = getChatTitle( this.projectId, chatId );
		const isFirstTurn = ! this.sessionsByChat.has( chatId );
		this.currentTurn = {
			userPrompt: prompt,
			assistantText: '',
			shouldAutoTitle: isFirstTurn && ! existingTitle,
		};

		// Hydrate session id from disk on first send for this chat after
		// restart.
		if ( ! this.sessionsByChat.has( chatId ) ) {
			const persisted = getSessionId( this.projectId, chatId );
			if ( persisted ) {
				this.sessionsByChat.set( chatId, persisted );
			}
		}

		appendMessage( this.projectId, chatId, {
			kind: 'user',
			id: randomUUID(),
			text: prompt,
			at: Date.now(),
		} );

		const writingPrompt = loadPromptWithProjectPath(
			resolveBundledPromptPath( 'writing-assistant.txt' ),
			project.path
		);
		const goalSuffix = project.goal
			? `\n\n## Project goal\n${ project.goal }`
			: '';

		const q = query( {
			prompt,
			options: {
				cwd: project.path,
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
					append: writingPrompt + goalSuffix,
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
		const project = getProject( this.projectId );
		if (
			project &&
			shouldAutoAllowStructuredFileTool( toolName, input, project.path )
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
			if ( project && isSafeBashWrite( command, project.path ) ) {
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
						this.projectId,
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
					const joined = textParts.join( '' );
					if ( this.currentTurn ) {
						this.currentTurn.assistantText +=
							( this.currentTurn.assistantText ? '\n\n' : '' ) +
							joined;
					}
					appendMessage( this.projectId, this.currentChatId, {
						kind: 'assistant',
						id: randomUUID(),
						text: joined,
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
						appendMessage( this.projectId, this.currentChatId, {
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
				const success = msg.subtype === 'success';
				if ( success && this.currentTurn?.shouldAutoTitle ) {
					this.maybeAutoTitle( this.currentChatId, this.currentTurn );
				}
				this.currentTurn = null;
				this.emit( {
					kind: 'done',
					success,
				} );
			}
		}
	}

	private maybeAutoTitle(
		chatId: string,
		turn: { userPrompt: string; assistantText: string }
	): void {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey || ! turn.assistantText.trim() ) {
			return;
		}
		const projectId = this.projectId;
		void ( async () => {
			const title = await generateChatTitle(
				apiKey,
				turn.userPrompt,
				turn.assistantText
			);
			if ( ! title ) {
				return;
			}
			const projectPath = resolveProjectPath( projectId );
			if ( ! projectPath ) {
				return;
			}
			touchMeta( projectPath, chatId, { title } );
			this.emit( { kind: 'chat-title', chatId, title } );
		} )();
	}

	private handleStreamEvent( raw: unknown ): void {
		const ev = raw as {
			type?: string;
			index?: number;
			delta?: { type?: string; text?: string; partial_json?: string };
			content_block?: { type?: string; id?: string; name?: string };
		};
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
		const stamped = {
			projectId: this.projectId,
			...event,
		} as AgentEvent;
		agentOnEvent.emit( this.webContents, stamped );
	}
}

const services = new Map< number, Map< string, AgentService > >();

export function getOrCreateAgentService(
	contents: WebContents,
	projectId: string
): AgentService {
	let perProject = services.get( contents.id );
	if ( ! perProject ) {
		perProject = new Map();
		services.set( contents.id, perProject );
		contents.once( 'destroyed', () => services.delete( contents.id ) );
	}
	let service = perProject.get( projectId );
	if ( ! service ) {
		service = new AgentService( contents, projectId );
		perProject.set( projectId, service );
	}
	return service;
}

export function getAgentService(
	contents: WebContents,
	projectId: string
): AgentService | undefined {
	return services.get( contents.id )?.get( projectId );
}
