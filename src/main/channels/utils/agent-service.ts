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
import { loadPrompt } from './prompts';
import {
	resolveBundledPromptPath,
	resolveBundledSettingsPath,
	resolveClaudeCodeBinary,
} from './resource-paths';
import { agentOnEvent } from '../agent-on-event';
import {
	type AgentEvent,
	type DraftAttachment,
	type MessageSelection,
	type PermissionResponse,
	type PersistedMessage,
} from '../../../types';

export { DEFAULT_CHAT_ID } from './chat-store';

type UnstampedEvent = AgentEvent extends infer T
	? T extends { projectId: string; chatId: string }
		? Omit< T, 'projectId' | 'chatId' >
		: never
	: never;

type PendingPermission = {
	chatId: string;
	resolve: ( decision: PermissionResponse ) => void;
	reject: ( err: Error ) => void;
};

// One in-flight `send()` per chat. Holds the iteration-scoped state that used
// to live as singletons on AgentService. Concurrent runs across chats each
// own their own Run so events don't clobber each other.
type Run = {
	chatId: string;
	abortController: AbortController;
	currentTurn: { userPrompt: string; assistantText: string };
	partialToolInputs: Map< string, string >;
	pendingToolCalls: Map< string, { toolName: string; input: unknown } >;
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

function getDraftRelPath(
	projectId: string,
	chatId: string
): string | undefined {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return undefined;
	}
	const meta = readMetaFile( projectPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.draftRelPath;
}

async function generateChatTitle(
	apiKey: string,
	userPrompt: string
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
						content: `Summarize the message below as a 3–5 word chat title. Reply with only the title — no quotes, no trailing punctuation, no explanation.\n\n${ userPrompt.slice(
							0,
							1600
						) }`,
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
	private readonly binaryPath: string;
	private readonly bundledSettingsPath: string;
	private readonly pendingPermissions = new Map<
		string,
		PendingPermission
	>();
	private readonly allowForSession = new Set< string >();
	// Active runs keyed by chatId. A second send() for the same chat while one
	// is already running is a no-op — but two different chats can run side by
	// side, each with their own Run.
	private readonly runs = new Map< string, Run >();

	constructor(
		private readonly webContents: WebContents,
		public readonly projectId: string
	) {
		this.binaryPath = resolveClaudeCodeBinary();
		this.bundledSettingsPath = resolveBundledSettingsPath();
	}

	async send(
		prompt: string,
		chatId: string = DEFAULT_CHAT_ID,
		opts: {
			userMessageText?: string;
			attachments?: DraftAttachment[];
			selections?: MessageSelection[];
		} = {}
	): Promise< void > {
		if ( this.runs.has( chatId ) ) {
			return;
		}

		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			this.emit( chatId, {
				kind: 'error',
				message: 'ANTHROPIC_API_KEY is not set',
			} );
			this.emit( chatId, {
				kind: 'done',
				success: false,
				cancelled: false,
			} );
			return;
		}

		const project = getProject( this.projectId );
		if ( ! project ) {
			this.emit( chatId, {
				kind: 'error',
				message: `Project ${ this.projectId } is not linked.`,
			} );
			this.emit( chatId, {
				kind: 'done',
				success: false,
				cancelled: false,
			} );
			return;
		}
		if ( ! fs.existsSync( project.path ) ) {
			this.emit( chatId, {
				kind: 'error',
				message: `Project folder no longer exists on disk: ${ project.path }`,
			} );
			this.emit( chatId, {
				kind: 'done',
				success: false,
				cancelled: false,
			} );
			return;
		}

		const existingTitle = getChatTitle( this.projectId, chatId );
		const isFirstTurn = ! this.sessionsByChat.has( chatId );

		const run: Run = {
			chatId,
			abortController: new AbortController(),
			currentTurn: { userPrompt: prompt, assistantText: '' },
			partialToolInputs: new Map(),
			pendingToolCalls: new Map(),
		};
		this.runs.set( chatId, run );

		// Fire the auto-title pass off the user's first message, in parallel
		// with the agent run, so the sidebar updates before the assistant
		// finishes streaming.
		if ( isFirstTurn && ! existingTitle ) {
			this.maybeAutoTitle( chatId, prompt );
		}

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
			text: opts.userMessageText ?? prompt,
			attachments: opts.attachments ?? [],
			selections: opts.selections ?? [],
			at: Date.now(),
		} );

		// Draft chats get a different system prompt — focused on editing the
		// active draft rather than the whole project. The presence of
		// draftRelPath on the ChatMeta is the discriminator. The stored
		// draftRelPath is relative to the project's drafts/ folder (it's the
		// same shape drafts:read uses), so prepend "drafts/" to give the agent
		// a path it can resolve from the project root.
		const draftRelPath = getDraftRelPath( this.projectId, chatId );
		const writingPrompt = draftRelPath
			? loadPrompt( resolveBundledPromptPath( 'edit-draft.txt' ), {
					project: project.path,
					draft: `drafts/${ draftRelPath }`,
			  } )
			: loadPrompt( resolveBundledPromptPath( 'writing-assistant.txt' ), {
					project: project.path,
			  } );
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
				canUseTool: this.makeCanUseTool( chatId ),
				includePartialMessages: true,
				abortController: run.abortController,
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
				this.handleMessage( run, msg );
			}
		} catch ( err ) {
			if ( run.abortController.signal.aborted ) {
				appendMessage( this.projectId, chatId, {
					kind: 'assistant',
					id: randomUUID(),
					text: '',
					cancelled: true,
					at: Date.now(),
				} );
				this.emit( chatId, {
					kind: 'done',
					success: false,
					cancelled: true,
				} );
			} else {
				this.emit( chatId, {
					kind: 'error',
					message: err instanceof Error ? err.message : String( err ),
				} );
				this.emit( chatId, {
					kind: 'done',
					success: false,
					cancelled: false,
				} );
			}
		} finally {
			this.runs.delete( chatId );
			// Resolve any lingering permission prompts for this chat so the UI
			// unblocks. Permissions for other chats stay live.
			for ( const [ requestId, pending ] of this.pendingPermissions ) {
				if ( pending.chatId !== chatId ) {
					continue;
				}
				this.pendingPermissions.delete( requestId );
				pending.reject( new Error( 'Run ended before decision.' ) );
			}
		}
	}

	cancel( chatId: string = DEFAULT_CHAT_ID ): void {
		this.runs.get( chatId )?.abortController.abort();
	}

	respondToPermission( response: PermissionResponse ): void {
		const pending = this.pendingPermissions.get( response.requestId );
		if ( ! pending ) {
			return;
		}
		this.pendingPermissions.delete( response.requestId );
		pending.resolve( response );
	}

	emitError( err: unknown, chatId: string = DEFAULT_CHAT_ID ): void {
		this.emit( chatId, {
			kind: 'error',
			message: err instanceof Error ? err.message : String( err ),
		} );
		this.emit( chatId, { kind: 'done', success: false, cancelled: false } );
	}

	private makeCanUseTool( chatId: string ): CanUseTool {
		return async ( toolName, input ): Promise< PermissionResult > => {
			if ( this.allowForSession.has( toolName ) ) {
				return { behavior: 'allow', updatedInput: input };
			}
			const project = getProject( this.projectId );
			if (
				project &&
				shouldAutoAllowStructuredFileTool(
					toolName,
					input,
					project.path
				)
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
							chatId,
							resolve,
							reject,
						} );
						this.emit( chatId, {
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
	}

	private handleMessage( run: Run, msg: SDKMessage ): void {
		const { chatId } = run;
		switch ( msg.type ) {
			case 'system':
				if ( msg.subtype === 'init' ) {
					this.sessionsByChat.set( chatId, msg.session_id );
					setSessionId( this.projectId, chatId, msg.session_id );
					this.emit( chatId, {
						kind: 'init',
						sessionId: msg.session_id,
					} );
				}
				return;

			case 'stream_event': {
				this.handleStreamEvent( run, msg.event );
				return;
			}

			case 'assistant': {
				const textParts: string[] = [];
				for ( const block of msg.message.content ) {
					if ( block.type === 'tool_use' ) {
						run.pendingToolCalls.set( block.id, {
							toolName: block.name,
							input: block.input,
						} );
						this.emit( chatId, {
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
					run.currentTurn.assistantText +=
						( run.currentTurn.assistantText ? '\n\n' : '' ) +
						joined;
					appendMessage( this.projectId, chatId, {
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
						this.emit( chatId, {
							kind: 'tool-result',
							toolUseId: typed.tool_use_id,
							output,
							isError: typed.is_error === true,
						} );
						const call = run.pendingToolCalls.get(
							typed.tool_use_id
						);
						run.pendingToolCalls.delete( typed.tool_use_id );
						appendMessage( this.projectId, chatId, {
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
				this.emit( chatId, {
					kind: 'result',
					costUsd: msg.total_cost_usd ?? 0,
					tokens:
						( msg.usage?.input_tokens ?? 0 ) +
						( msg.usage?.output_tokens ?? 0 ),
					durationMs: msg.duration_ms ?? 0,
					numTurns: msg.num_turns ?? 0,
				} );
				const success = msg.subtype === 'success';
				this.emit( chatId, {
					kind: 'done',
					success,
					cancelled: false,
				} );
			}
		}
	}

	private maybeAutoTitle( chatId: string, userPrompt: string ): void {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey || ! userPrompt.trim() ) {
			return;
		}
		const projectId = this.projectId;
		void ( async () => {
			const title = await generateChatTitle( apiKey, userPrompt );
			if ( ! title ) {
				return;
			}
			const projectPath = resolveProjectPath( projectId );
			if ( ! projectPath ) {
				return;
			}
			touchMeta( projectPath, chatId, { title } );
			this.emit( chatId, { kind: 'chat-title', title } );
		} )();
	}

	private handleStreamEvent( run: Run, raw: unknown ): void {
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
			this.emit( run.chatId, {
				kind: 'text-delta',
				text: ev.delta.text,
			} );
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
			run.partialToolInputs.set(
				key,
				( run.partialToolInputs.get( key ) ?? '' ) +
					ev.delta.partial_json
			);
		}
	}

	private emit( chatId: string, event: UnstampedEvent ): void {
		const stamped = {
			projectId: this.projectId,
			chatId,
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
