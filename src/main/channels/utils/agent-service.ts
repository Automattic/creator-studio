import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { type WebContents } from 'electron';
import {
	query,
	type CanUseTool,
	type PermissionResult,
	type SDKAssistantMessageError,
	type SDKMessage,
	type SDKResultError,
} from '@anthropic-ai/claude-agent-sdk';

import {
	chatLogPath,
	DEFAULT_CHAT_ID,
	ensureDir,
	readMetaFile,
	resolveProjectPath,
	touchMeta,
} from './chat-store';
import { getCachedClaudeAuthStatus } from './claude-auth-status';
import {
	classifyCreatedResource,
	pickAutoOpenResource,
	type AutoOpenResource,
} from './created-resource';
import { buildChildEnv, runOneShotPrompt } from './one-shot-prompt';
import {
	isReadOnlyBashCommand,
	isSafeBashWrite,
	shouldAutoAllowStructuredFileTool,
} from './permissions';
import { classifyToolEdit, type TouchedDraft } from './classify-tool-edit';
import { takeSnapshot } from './draft-history';
import { getProject } from './project-get';
import { loadPrompt } from './prompts';
import {
	resolveBundledPromptPath,
	resolveBundledSettingsPath,
	resolveClaudeCodeBinary,
} from './resource-paths';
import { getTaskManager } from './task-manager';
import {
	createTaskMcpServer,
	isTaskMcpTool,
	TASK_MCP_SERVER_NAME,
} from './task-tools';
import { readStore } from './ui-prefs-store';
import { agentOnEvent } from '../agent-on-event';
import { draftsHistoryOnChanged } from '../drafts-history-on-changed';
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
	projectPath: string;
	abortController: AbortController;
	currentTurn: { userPrompt: string; assistantText: string };
	partialToolInputs: Map< string, string >;
	pendingToolCalls: Map<
		string,
		{ toolName: string; input: unknown; fileExistedBefore?: boolean }
	>;
	// Markdown files under drafts/ or sources/ newly created (Write to a path
	// that did not exist) during this run. Drives the auto-open decision in
	// `emitDone` — see issue #155.
	createdResources: AutoOpenResource[];
	// Drafts the agent wrote to during this turn. Keyed by tool_use_id so a
	// tool_result with `is_error: true` can drop the corresponding entry —
	// only successful writes earn an auto-snapshot at turn end.
	pendingDraftEdits: Map< string, TouchedDraft >;
	confirmedDraftEdits: Map< string, TouchedDraft >;
	// Tracked so the iterator-completion safety net in `finally` doesn't
	// double-emit `done` after the `result` handler already did.
	doneEmitted: boolean;
};

// True when a Write tool call targets a file that already exists on disk.
// Checked before the tool runs so a successful Write afterwards can be
// classified as a create vs. an overwrite.
function writeTargetExists( projectPath: string, input: unknown ): boolean {
	const filePath = ( input as { file_path?: unknown } )?.file_path;
	if ( typeof filePath !== 'string' || filePath.length === 0 ) {
		return false;
	}
	try {
		return fs.existsSync( path.resolve( projectPath, filePath ) );
	} catch {
		return false;
	}
}

// Map SDK-internal error codes to messages a user can act on. The SDK
// surfaces these on assistant messages (msg.error) when a turn fails; the
// most common in practice is `authentication_failed` (a bad API key, or
// a signed-out / expired Claude Code session).
function describeAssistantError(
	error: SDKAssistantMessageError,
	authMode: 'api-key' | 'claude-code'
): string {
	switch ( error ) {
		case 'authentication_failed':
			return authMode === 'claude-code'
				? "Your Claude Code session can't be used. Open Settings to sign in again."
				: 'Invalid Anthropic API key. Open Settings to update it.';
		case 'billing_error':
			return 'Anthropic billing error. Check your account at console.anthropic.com.';
		case 'rate_limit':
			return 'Rate limit reached. Wait a moment and try again.';
		case 'invalid_request':
			return 'Anthropic rejected the request as invalid.';
		case 'server_error':
			return 'Anthropic server error. Try again in a moment.';
		case 'max_output_tokens':
			return 'The response hit the maximum token limit.';
		case 'unknown':
		default:
			return 'Anthropic returned an unexpected error.';
	}
}

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
	userPrompt: string,
	cwd: string
): Promise< string | null > {
	try {
		const raw = await runOneShotPrompt(
			`Summarize the message below as a 3–5 word chat title. Reply with only the title — no quotes, no trailing punctuation, no explanation.\n\n${ userPrompt.slice(
				0,
				1600
			) }`,
			{ cwd, model: 'claude-haiku-4-5-20251001' }
		);
		if ( ! raw ) {
			return null;
		}
		return raw
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

		const authMode = readStore().authMode ?? 'api-key';
		if ( authMode === 'api-key' ) {
			if ( ! process.env.ANTHROPIC_API_KEY ) {
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
		} else {
			// OAuth pre-flight: refuse to start the SDK if we know the user
			// is signed out. The cache is warmed at app startup and by the
			// Settings modal; a cold miss reads as signed-out and routes
			// the user to Settings, where Refresh will warm it.
			const status = getCachedClaudeAuthStatus();
			if ( ! status.signedIn ) {
				this.emit( chatId, {
					kind: 'error',
					message:
						'You are signed out of Claude Code. Open Settings to sign in.',
					code: 'claude_code_signed_out',
				} );
				this.emit( chatId, {
					kind: 'done',
					success: false,
					cancelled: false,
				} );
				return;
			}
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
			projectPath: project.path,
			abortController: new AbortController(),
			currentTurn: { userPrompt: prompt, assistantText: '' },
			partialToolInputs: new Map(),
			pendingToolCalls: new Map(),
			createdResources: [],
			pendingDraftEdits: new Map(),
			confirmedDraftEdits: new Map(),
			doneEmitted: false,
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

		const writingPrompt = loadPrompt(
			resolveBundledPromptPath( 'writing-assistant.txt' ),
			{ project: project.path }
		);
		const goalSuffix = project.goal
			? `\n\n## Project goal\n${ project.goal }`
			: '';

		// In-process capability + task-control tools. Invisible to the user
		// (no install, no subprocess); shared with the headless task runner.
		const taskMcpServer = createTaskMcpServer( {
			projectId: this.projectId,
			listTasks: () => getTaskManager().listDefinitions( this.projectId ),
			runTask: ( taskId ) =>
				getTaskManager().runDefinition(
					this.projectId,
					taskId,
					'chat-triggered'
				),
		} );

		const q = query( {
			prompt,
			options: {
				cwd: project.path,
				env: {
					...buildChildEnv(),
					// SDK MCP calls can run longer than the 60s default.
					CLAUDE_CODE_STREAM_CLOSE_TIMEOUT: '120000',
				},
				pathToClaudeCodeExecutable: this.binaryPath,
				settings: this.bundledSettingsPath,
				settingSources: [ 'user', 'project', 'local' ],
				permissionMode: 'default',
				mcpServers: { [ TASK_MCP_SERVER_NAME ]: taskMcpServer },
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
				this.emitDone( run, { success: false, cancelled: true } );
			} else {
				this.emit( chatId, {
					kind: 'error',
					message: err instanceof Error ? err.message : String( err ),
				} );
				this.emitDone( run, { success: false, cancelled: false } );
			}
		} finally {
			// Safety net: if the SDK iterator completes without sending a
			// `result` (it can exit cleanly on certain failures, like a bad
			// API key after the SDK exhausts internal retries), the renderer
			// would otherwise leave the assistant bubble stuck in the
			// streaming state forever.
			if ( ! run.doneEmitted ) {
				const fallbackAuthMode = readStore().authMode ?? 'api-key';
				this.emit( chatId, {
					kind: 'error',
					message:
						fallbackAuthMode === 'claude-code'
							? 'The agent stopped without producing a result. Open Settings to verify your Claude Code session.'
							: 'The agent stopped without producing a result. Check that your Anthropic API key is valid.',
					code:
						fallbackAuthMode === 'claude-code'
							? 'claude_code_signed_out'
							: 'invalid_api_key',
				} );
				this.emitDone( run, { success: false, cancelled: false } );
			}
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

	private emitDone(
		run: Run,
		opts: { success: boolean; cancelled: boolean }
	): void {
		if ( run.doneEmitted ) {
			return;
		}
		run.doneEmitted = true;
		// Only a clean, uncancelled turn auto-opens a draft — a failed or
		// interrupted run leaves the user with an error to read, not a file.
		const openResource =
			opts.success && ! opts.cancelled
				? pickAutoOpenResource( run.createdResources )
				: null;
		this.emit( run.chatId, { kind: 'done', ...opts, openResource } );
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
			// Our own capability tools are read-only / safe — never prompt.
			if ( isTaskMcpTool( toolName ) ) {
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
							fileExistedBefore:
								block.name === 'Write'
									? writeTargetExists(
											run.projectPath,
											block.input
									  )
									: undefined,
						} );
						const touched = classifyToolEdit(
							this.projectId,
							block.name,
							block.input
						);
						if ( touched ) {
							run.pendingDraftEdits.set( block.id, touched );
						}
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
				// SDK marks turn-level failures (bad API key, billing, rate
				// limit, …) on the assistant message itself. Surface a
				// readable message; the run is usually terminated on the
				// next iteration via a result-error.
				if ( msg.error ) {
					const authMode = readStore().authMode ?? 'api-key';
					let code:
						| 'invalid_api_key'
						| 'claude_code_signed_out'
						| undefined;
					if ( msg.error === 'authentication_failed' ) {
						code =
							authMode === 'claude-code'
								? 'claude_code_signed_out'
								: 'invalid_api_key';
					}
					this.emit( chatId, {
						kind: 'error',
						message: describeAssistantError( msg.error, authMode ),
						code,
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
						const call = run.pendingToolCalls.get(
							typed.tool_use_id
						);
						run.pendingToolCalls.delete( typed.tool_use_id );
						this.emit( chatId, {
							kind: 'tool-result',
							toolUseId: typed.tool_use_id,
							toolName: call?.toolName ?? 'unknown',
							output,
							isError: typed.is_error === true,
						} );
						const pendingEdit = run.pendingDraftEdits.get(
							typed.tool_use_id
						);
						run.pendingDraftEdits.delete( typed.tool_use_id );
						if ( pendingEdit && typed.is_error !== true ) {
							// Key by `<folder>:<relPath>` so a draft edited
							// multiple times in one turn snapshots once at
							// the end, not once per edit.
							run.confirmedDraftEdits.set(
								`${ pendingEdit.folder }:${ pendingEdit.relPath }`,
								pendingEdit
							);
						}
						if (
							call?.toolName === 'Write' &&
							call.fileExistedBefore === false &&
							typed.is_error !== true
						) {
							const resource = classifyCreatedResource(
								run.projectPath,
								( call.input as { file_path?: unknown } )
									?.file_path
							);
							if ( resource ) {
								run.createdResources.push( resource );
							}
						}
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
				if ( success ) {
					this.flushDraftSnapshots( run );
				}
				if ( ! success ) {
					// Result-error variants (error_during_execution etc.)
					// carry the underlying API errors in `errors[]`. Without
					// surfacing them, the assistant bubble would just stop
					// streaming with no explanation.
					const errors = ( msg as SDKResultError ).errors ?? [];
					const detail =
						errors.length > 0 ? errors.join( '; ' ) : msg.subtype;
					this.emit( chatId, {
						kind: 'error',
						message: `Run failed: ${ detail }`,
					} );
				}
				this.emitDone( run, { success, cancelled: false } );
			}
		}
	}

	// Snapshot every draft the agent successfully edited during the turn that
	// just finished, then notify the renderer so an open History panel for an
	// affected draft can refresh without polling.
	private flushDraftSnapshots( run: Run ): void {
		if ( run.confirmedDraftEdits.size === 0 ) {
			return;
		}
		for ( const touched of run.confirmedDraftEdits.values() ) {
			const result = takeSnapshot(
				this.projectId,
				touched.folder,
				touched.relPath,
				'agent'
			);
			if ( result.ok === false ) {
				continue;
			}
			draftsHistoryOnChanged.emit( this.webContents, {
				projectId: this.projectId,
				folder: touched.folder,
				relPath: touched.relPath,
				snapshot: result.snapshot,
			} );
		}
		run.confirmedDraftEdits.clear();
	}

	private maybeAutoTitle( chatId: string, userPrompt: string ): void {
		if ( ! userPrompt.trim() ) {
			return;
		}
		const projectId = this.projectId;
		const project = getProject( projectId );
		if ( ! project ) {
			return;
		}
		void ( async () => {
			const title = await generateChatTitle( userPrompt, project.path );
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
