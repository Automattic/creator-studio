/**
 * Headless execution of a single task run. Drives the Claude Agent SDK with
 * the task system prompt and the in-process capability tools, streams the
 * conversation into the run transcript, and emits `tasks:onEvent` updates.
 *
 * Owns no scheduling or queueing — that is TaskManager's job. TaskManager
 * creates the `LiveRun`, calls `executeTaskRun`, and resolves parked
 * permission promises via `LiveRun.pendingPermissions`.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import {
	query,
	type CanUseTool,
	type PermissionResult,
	type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { checkAgentAuthReady } from './agent-auth-preflight';
import { buildChildEnv } from './one-shot-prompt';
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
import {
	extractAssistantParts,
	extractResult,
	extractTextDelta,
	extractToolResults,
} from './sdk-message-translate';
import { appendRunMessage } from './task-store';
import {
	createTaskMcpServer,
	isTaskMcpTool,
	TASK_MCP_SERVER_NAME,
} from './task-tools';
import type {
	Project,
	TaskDefinition,
	TaskRun,
	TasksEvent,
} from '../../../types';

// Iteration-scoped state for one in-flight run. TaskManager creates it,
// holds it in its registry, and resolves `pendingPermissions` entries when
// the user answers a permission request.
export type LiveRun = {
	// The run meta record — mutated in place as the run progresses.
	run: TaskRun;
	projectPath: string;
	// The instructions to run: a definition's `instructions`, or a generated
	// prompt for a one-off run (e.g. resource import).
	prompt: string;
	abortController: AbortController;
	// requestId -> resolver. `true` allows the gated tool, `false` denies it.
	pendingPermissions: Map< string, ( allow: boolean ) => void >;
};

export type TaskRunnerDeps = {
	emit: ( event: TasksEvent ) => void;
	persist: ( run: TaskRun ) => void;
	// The current project's saved definitions (for the list_tasks MCP tool).
	listTasks: () => TaskDefinition[];
	// Trigger a saved task in the background (for the run_task MCP tool).
	runTask: ( taskId: string ) => string | null;
};

function buildTaskSystemPrompt( project: Project ): string {
	const writing = loadPrompt(
		resolveBundledPromptPath( 'writing-assistant.txt' ),
		{ project: project.path }
	);
	const taskMode = loadPrompt( resolveBundledPromptPath( 'task-mode.md' ), {
		project: project.path,
	} );
	const goal = project.goal ? `\n\n## Project goal\n${ project.goal }` : '';
	return `${ writing }\n\n${ taskMode }${ goal }`;
}

// Pull the agent's `SUMMARY:` line out of its final message; fall back to the
// first non-empty line so a run always has a one-line result.
function parseSummary( text: string ): string | null {
	const lines = text.split( /\r?\n/ );
	for ( let i = lines.length - 1; i >= 0; i-- ) {
		const m = lines[ i ].match( /^\s*SUMMARY:\s*(.+)$/ );
		if ( m ) {
			return m[ 1 ].trim().slice( 0, 280 );
		}
	}
	const firstLine = lines
		.map( ( l ) => l.trim() )
		.find( ( l ) => l.length > 0 );
	return firstLine ? firstLine.slice( 0, 280 ) : null;
}

function makeTaskCanUseTool(
	live: LiveRun,
	deps: TaskRunnerDeps,
	projectPath: string,
	emitStatus: () => void
): CanUseTool {
	return async ( toolName, input ): Promise< PermissionResult > => {
		// Our own capability tools are read-only fetches / safe — never gated.
		if ( isTaskMcpTool( toolName ) ) {
			return { behavior: 'allow', updatedInput: input };
		}
		if (
			shouldAutoAllowStructuredFileTool( toolName, input, projectPath )
		) {
			return { behavior: 'allow', updatedInput: input };
		}
		if ( toolName === 'WebFetch' || toolName === 'WebSearch' ) {
			return { behavior: 'allow', updatedInput: input };
		}
		if (
			toolName === 'Bash' &&
			typeof input === 'object' &&
			input !== null
		) {
			const command = ( input as { command?: unknown } ).command;
			if ( typeof command === 'string' ) {
				if (
					isReadOnlyBashCommand( command ) ||
					isSafeBashWrite( command, projectPath )
				) {
					return { behavior: 'allow', updatedInput: input };
				}
			}
		}

		// Everything else pauses the run and waits for the user — no modal,
		// just a 'needs-permission' state surfaced via events.
		const requestId = randomUUID();
		live.run.pendingPermissionCount += 1;
		live.run.status = 'needs-permission';
		emitStatus();
		deps.emit( {
			kind: 'run-permission-request',
			runId: live.run.id,
			projectId: live.run.projectId,
			requestId,
			toolName,
			input,
		} );
		const allowed = await new Promise< boolean >( ( resolve ) => {
			live.pendingPermissions.set( requestId, resolve );
		} );
		live.pendingPermissions.delete( requestId );
		live.run.pendingPermissionCount = Math.max(
			0,
			live.run.pendingPermissionCount - 1
		);
		if (
			live.run.pendingPermissionCount === 0 &&
			live.run.status === 'needs-permission'
		) {
			live.run.status = 'running';
		}
		emitStatus();
		if ( ! allowed ) {
			return {
				behavior: 'deny',
				message:
					'The user did not approve this action for the background task.',
			};
		}
		return { behavior: 'allow', updatedInput: input };
	};
}

export async function executeTaskRun(
	live: LiveRun,
	deps: TaskRunnerDeps
): Promise< void > {
	const { run, projectPath } = live;
	const projectId = run.projectId;

	const emitStatus = (): void => {
		deps.persist( run );
		deps.emit( {
			kind: 'run-status',
			runId: run.id,
			projectId,
			run: { ...run },
		} );
	};

	const authError = checkAgentAuthReady();
	if ( authError ) {
		run.status = 'error';
		run.error = authError.message;
		run.summary = authError.message;
		run.endedAt = Date.now();
		emitStatus();
		return;
	}

	const project = getProject( projectId );
	if ( ! project || ! fs.existsSync( project.path ) ) {
		run.status = 'error';
		run.error = 'The project folder is no longer available.';
		run.summary = run.error;
		run.endedAt = Date.now();
		emitStatus();
		return;
	}

	// Open the transcript with the instructions, so the detail view shows
	// what the task was asked to do.
	appendRunMessage( projectPath, run.id, {
		kind: 'user',
		id: randomUUID(),
		text: live.prompt,
		attachments: [],
		selections: [],
		at: Date.now(),
	} );

	run.status = 'running';
	run.startedAt = Date.now();
	emitStatus();

	const mcpServer = createTaskMcpServer( {
		projectId,
		listTasks: deps.listTasks,
		runTask: deps.runTask,
	} );
	const pendingToolCalls = new Map<
		string,
		{ toolName: string; input: unknown }
	>();
	let assistantText = '';

	try {
		const q = query( {
			prompt: live.prompt,
			options: {
				cwd: project.path,
				env: {
					...buildChildEnv(),
					// SDK MCP calls can run longer than the 60s default.
					CLAUDE_CODE_STREAM_CLOSE_TIMEOUT: '120000',
				},
				pathToClaudeCodeExecutable: resolveClaudeCodeBinary(),
				settings: resolveBundledSettingsPath(),
				settingSources: [ 'user', 'project', 'local' ],
				permissionMode: 'default',
				mcpServers: { [ TASK_MCP_SERVER_NAME ]: mcpServer },
				canUseTool: makeTaskCanUseTool(
					live,
					deps,
					project.path,
					emitStatus
				),
				includePartialMessages: true,
				abortController: live.abortController,
				systemPrompt: {
					type: 'preset',
					preset: 'claude_code',
					append: buildTaskSystemPrompt( project ),
				},
			},
		} );

		for await ( const msg of q ) {
			handleMessage( msg );
		}

		if ( run.status === 'running' || run.status === 'needs-permission' ) {
			run.status = 'done';
		}
	} catch ( err ) {
		if ( live.abortController.signal.aborted ) {
			run.status = 'stopped';
		} else {
			run.status = 'error';
			run.error = err instanceof Error ? err.message : String( err );
		}
	} finally {
		run.endedAt = Date.now();
		run.pendingPermissionCount = 0;
		if ( run.status === 'done' ) {
			run.summary = parseSummary( assistantText );
		} else if ( run.status === 'stopped' ) {
			run.summary = 'Stopped before finishing.';
		} else if ( run.status === 'error' && ! run.summary ) {
			run.summary = run.error;
		}
		// Release any parked permission promises so nothing dangles.
		for ( const resolve of live.pendingPermissions.values() ) {
			resolve( false );
		}
		live.pendingPermissions.clear();
		emitStatus();
	}

	function handleMessage( msg: SDKMessage ): void {
		switch ( msg.type ) {
			case 'stream_event': {
				const delta = extractTextDelta( msg.event );
				if ( delta ) {
					deps.emit( {
						kind: 'run-text-delta',
						runId: run.id,
						projectId,
						text: delta,
					} );
				}
				return;
			}
			case 'assistant': {
				const parts = extractAssistantParts( msg );
				for ( const tu of parts.toolUses ) {
					pendingToolCalls.set( tu.toolUseId, {
						toolName: tu.toolName,
						input: tu.input,
					} );
					deps.emit( {
						kind: 'run-tool-use',
						runId: run.id,
						projectId,
						toolUseId: tu.toolUseId,
						toolName: tu.toolName,
						input: tu.input,
					} );
				}
				if ( parts.text.length > 0 ) {
					assistantText +=
						( assistantText ? '\n\n' : '' ) + parts.text;
					appendRunMessage( projectPath, run.id, {
						kind: 'assistant',
						id: randomUUID(),
						text: parts.text,
						at: Date.now(),
					} );
				}
				return;
			}
			case 'user': {
				for ( const tr of extractToolResults( msg ) ) {
					deps.emit( {
						kind: 'run-tool-result',
						runId: run.id,
						projectId,
						toolUseId: tr.toolUseId,
						output: tr.output,
						isError: tr.isError,
					} );
					const call = pendingToolCalls.get( tr.toolUseId );
					pendingToolCalls.delete( tr.toolUseId );
					appendRunMessage( projectPath, run.id, {
						kind: 'tool',
						id: randomUUID(),
						toolUseId: tr.toolUseId,
						toolName: call?.toolName ?? 'unknown',
						input: call?.input,
						status: tr.isError ? 'error' : 'done',
						output: tr.output,
						at: Date.now(),
					} );
				}
				return;
			}
			case 'result': {
				const r = extractResult( msg );
				if ( ! r.success ) {
					run.status = 'error';
					run.error = `The task run failed: ${ r.errorDetail }`;
				} else {
					run.status = 'done';
				}
			}
		}
	}
}
