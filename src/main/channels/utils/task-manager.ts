/**
 * Process-global owner of the task system: holds task definitions and the
 * live run registry in memory, runs the scheduler, executes queued runs
 * (delegating to `task-runner`), and fans `tasks:onEvent` out to every open
 * window.
 *
 * Created once at app startup via `getTaskManager().start()`.
 */
import { randomUUID } from 'node:crypto';

import type { WebContents } from 'electron';

import { getProject } from './project-get';
import { readStore as readProjectStore } from './project-store';
import { mostRecentDue } from './task-schedule';
import {
	deleteTask as deleteTaskFromStore,
	patchTask,
	pruneRuns,
	readRunMessages,
	readRuns,
	readTasks,
	upsertRun,
	upsertTask,
	writeRuns,
	writeTasks,
} from './task-store';
import { executeTaskRun, type LiveRun } from './task-runner';
import { tasksOnEvent } from '../tasks-on-event';
import type {
	PersistedMessage,
	TaskDefinition,
	TaskPermissionResponse,
	TaskRun,
	TaskRunKind,
	TaskSchedule,
	TasksEvent,
} from '../../../types';

const MAX_CONCURRENT_RUNS = 2;
const SCHEDULER_INTERVAL_MS = 60_000;

class TaskManager {
	// projectId -> the project's task definitions.
	private readonly definitions = new Map< string, TaskDefinition[] >();
	// runId -> live state, for runs that are queued / running / paused.
	private readonly live = new Map< string, LiveRun >();
	private readonly queue: string[] = [];
	private activeCount = 0;
	private readonly windows = new Set< WebContents >();
	private schedulerTimer: NodeJS.Timeout | null = null;
	private started = false;

	start(): void {
		if ( this.started ) {
			return;
		}
		this.started = true;
		this.hydrate();
		this.schedulerTimer = setInterval(
			() => this.checkSchedule(),
			SCHEDULER_INTERVAL_MS
		);
		// An early check catches schedules missed while the app was closed.
		setTimeout( () => this.checkSchedule(), 5_000 );
	}

	shutdown(): void {
		if ( this.schedulerTimer ) {
			clearInterval( this.schedulerTimer );
			this.schedulerTimer = null;
		}
		// Abort in-flight runs and flush their status synchronously so the
		// next launch sees accurate state (the startup repair is the backup).
		for ( const live of this.live.values() ) {
			live.abortController.abort();
			if (
				live.run.status === 'queued' ||
				live.run.status === 'running' ||
				live.run.status === 'needs-permission'
			) {
				live.run.status = 'stopped';
				live.run.endedAt = Date.now();
				live.run.summary = 'Stopped — the app was closing.';
				this.persistRun( live.run );
			}
		}
	}

	registerWindow( wc: WebContents ): void {
		if ( this.windows.has( wc ) ) {
			return;
		}
		this.windows.add( wc );
		wc.once( 'destroyed', () => this.windows.delete( wc ) );
	}

	// --- Definitions ---

	listDefinitions( projectId?: string ): TaskDefinition[] {
		if ( projectId ) {
			return [ ...( this.definitions.get( projectId ) ?? [] ) ];
		}
		const all: TaskDefinition[] = [];
		for ( const list of this.definitions.values() ) {
			all.push( ...list );
		}
		return all;
	}

	createDefinition(
		projectId: string,
		input: {
			title: string;
			description?: string;
			instructions: string;
			schedule: TaskSchedule;
		}
	): TaskDefinition | null {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const now = Date.now();
		const def: TaskDefinition = {
			id: randomUUID(),
			projectId,
			title: input.title,
			description: input.description ?? '',
			instructions: input.instructions,
			schedule: input.schedule,
			enabled: true,
			createdAt: now,
			updatedAt: now,
			lastRunAt: null,
			lastScheduledCheckAt: null,
		};
		upsertTask( project.path, def );
		this.replaceInMemory( projectId, def );
		this.emitEvent( { kind: 'definitions-changed', projectId } );
		return def;
	}

	updateDefinition(
		projectId: string,
		id: string,
		patch: {
			title?: string;
			description?: string;
			instructions?: string;
			schedule?: TaskSchedule;
			enabled?: boolean;
		}
	): TaskDefinition | null {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const updated = patchTask( project.path, id, {
			...patch,
			updatedAt: Date.now(),
		} );
		if ( ! updated ) {
			return null;
		}
		this.replaceInMemory( projectId, updated );
		this.emitEvent( { kind: 'definitions-changed', projectId } );
		return updated;
	}

	deleteDefinition( projectId: string, id: string ): boolean {
		const project = getProject( projectId );
		if ( ! project ) {
			return false;
		}
		const removed = deleteTaskFromStore( project.path, id );
		const list = this.definitions.get( projectId );
		if ( list ) {
			this.definitions.set(
				projectId,
				list.filter( ( d ) => d.id !== id )
			);
		}
		if ( removed ) {
			this.emitEvent( { kind: 'definitions-changed', projectId } );
		}
		return removed;
	}

	// Forget a project when its workspace is unlinked: aborts its live runs
	// and drops its definitions so orphaned tasks never surface in the global
	// Tasks view. The on-disk tasks.json is left intact — unlinking a project
	// does not delete the folder's contents.
	removeProject( projectId: string ): void {
		for ( const [ runId, live ] of this.live ) {
			if ( live.run.projectId !== projectId ) {
				continue;
			}
			live.abortController.abort();
			const idx = this.queue.indexOf( runId );
			if ( idx >= 0 ) {
				this.queue.splice( idx, 1 );
			}
			this.live.delete( runId );
		}
		if ( this.definitions.delete( projectId ) ) {
			this.emitEvent( { kind: 'definitions-changed', projectId } );
		}
	}

	// --- Runs ---

	listRuns( projectId?: string ): TaskRun[] {
		const projects = readProjectStore().projects;
		const wanted = projectId
			? projects.filter( ( p ) => p.id === projectId )
			: projects;
		const runs: TaskRun[] = [];
		for ( const p of wanted ) {
			runs.push( ...readRuns( p.path ) );
		}
		return runs.sort( ( a, b ) => b.createdAt - a.createdAt );
	}

	getRunMessages( projectId: string, runId: string ): PersistedMessage[] {
		const project = getProject( projectId );
		if ( ! project ) {
			return [];
		}
		return readRunMessages( project.path, runId );
	}

	// Manually start a saved task. Returns the new run id, or null when no
	// definition with that id exists in the project.
	runDefinition(
		projectId: string,
		defId: string,
		kind: TaskRunKind
	): string | null {
		const def = ( this.definitions.get( projectId ) ?? [] ).find(
			( d ) => d.id === defId
		);
		if ( ! def ) {
			return null;
		}
		return this.enqueue( {
			projectId,
			definitionId: def.id,
			title: def.title,
			kind,
			prompt: def.instructions,
		} );
	}

	// Queue a one-off run with no saved definition (e.g. resource import).
	enqueueOneOff( spec: {
		projectId: string;
		title: string;
		kind: TaskRunKind;
		prompt: string;
	} ): string | null {
		return this.enqueue( { ...spec, definitionId: null } );
	}

	stopRun( runId: string ): boolean {
		const live = this.live.get( runId );
		if ( ! live ) {
			return false;
		}
		if ( live.run.status === 'queued' ) {
			// Not started yet — drop it from the queue and mark it stopped.
			const idx = this.queue.indexOf( runId );
			if ( idx >= 0 ) {
				this.queue.splice( idx, 1 );
			}
			live.run.status = 'stopped';
			live.run.endedAt = Date.now();
			live.run.summary = 'Stopped before it started.';
			this.persistRun( live.run );
			this.emitEvent( {
				kind: 'run-status',
				runId,
				projectId: live.run.projectId,
				run: { ...live.run },
			} );
			this.live.delete( runId );
			return true;
		}
		live.abortController.abort();
		return true;
	}

	respondPermission( response: TaskPermissionResponse ): void {
		const live = this.live.get( response.runId );
		const resolve = live?.pendingPermissions.get( response.requestId );
		if ( resolve ) {
			resolve( response.decision === 'allow' );
		}
	}

	// --- Internals ---

	private enqueue( spec: {
		projectId: string;
		definitionId: string | null;
		title: string;
		kind: TaskRunKind;
		prompt: string;
	} ): string | null {
		const project = getProject( spec.projectId );
		if ( ! project ) {
			return null;
		}
		const now = Date.now();
		const run: TaskRun = {
			id: randomUUID(),
			projectId: spec.projectId,
			definitionId: spec.definitionId,
			title: spec.title,
			kind: spec.kind,
			status: 'queued',
			createdAt: now,
			startedAt: null,
			endedAt: null,
			summary: null,
			error: null,
			pendingPermissionCount: 0,
		};
		const live: LiveRun = {
			run,
			projectPath: project.path,
			prompt: spec.prompt,
			abortController: new AbortController(),
			pendingPermissions: new Map(),
		};
		this.live.set( run.id, live );
		upsertRun( project.path, run );
		this.emitEvent( {
			kind: 'run-status',
			runId: run.id,
			projectId: run.projectId,
			run: { ...run },
		} );
		this.queue.push( run.id );
		this.pump();
		return run.id;
	}

	private pump(): void {
		while (
			this.activeCount < MAX_CONCURRENT_RUNS &&
			this.queue.length > 0
		) {
			const runId = this.queue.shift();
			if ( ! runId ) {
				break;
			}
			const live = this.live.get( runId );
			if ( ! live ) {
				continue;
			}
			this.activeCount += 1;
			void this.runOne( live );
		}
	}

	private async runOne( live: LiveRun ): Promise< void > {
		try {
			await executeTaskRun( live, {
				emit: ( e ) => this.emitEvent( e ),
				persist: ( run ) => this.persistRun( run ),
				listTasks: () => this.listDefinitions( live.run.projectId ),
				runTask: ( taskId ) =>
					this.runDefinition(
						live.run.projectId,
						taskId,
						'chat-triggered'
					),
			} );
		} catch ( err ) {
			// executeTaskRun handles its own failures; this is a last resort.
			live.run.status = 'error';
			live.run.error = err instanceof Error ? err.message : String( err );
			this.persistRun( live.run );
		} finally {
			this.live.delete( live.run.id );
			this.activeCount -= 1;
			pruneRuns( live.projectPath );
			if ( live.run.definitionId ) {
				this.patchDefinition(
					live.run.projectId,
					live.run.definitionId,
					{ lastRunAt: Date.now() }
				);
			}
			this.pump();
		}
	}

	private hydrate(): void {
		for ( const project of readProjectStore().projects ) {
			// projectId repair: re-linking a folder mints a new project id,
			// but its tasks.json / task-runs.json keep the old one — which
			// orphans every task under a project that no longer exists. The
			// folder's current project id is authoritative.
			const defs = readTasks( project.path );
			let defsChanged = false;
			for ( const def of defs ) {
				if ( def.projectId !== project.id ) {
					def.projectId = project.id;
					defsChanged = true;
				}
			}
			if ( defsChanged ) {
				writeTasks( project.path, defs );
			}
			this.definitions.set( project.id, defs );

			// Stale-run repair: a persisted run still in a non-terminal state
			// means the app died mid-run. Same projectId repair as above.
			const runs = readRuns( project.path );
			let runsChanged = false;
			for ( const run of runs ) {
				if ( run.projectId !== project.id ) {
					run.projectId = project.id;
					runsChanged = true;
				}
				if (
					run.status === 'queued' ||
					run.status === 'running' ||
					run.status === 'needs-permission'
				) {
					run.status = 'error';
					run.error =
						'Interrupted — the app was closed during this run.';
					run.summary = run.error;
					run.endedAt = run.endedAt ?? Date.now();
					run.pendingPermissionCount = 0;
					runsChanged = true;
				}
			}
			if ( runsChanged ) {
				writeRuns( project.path, runs );
			}
		}
	}

	private checkSchedule(): void {
		const now = Date.now();
		for ( const [ projectId, defs ] of this.definitions ) {
			if ( ! getProject( projectId ) ) {
				continue;
			}
			for ( const def of defs ) {
				if ( ! def.enabled || def.schedule.kind === 'manual' ) {
					continue;
				}
				const due = mostRecentDue( def.schedule, now );
				if ( due !== null ) {
					const lastRun = def.lastRunAt ?? 0;
					const lastCheck = def.lastScheduledCheckAt ?? def.createdAt;
					if (
						due > lastRun &&
						due > lastCheck &&
						! this.hasActiveRunForDefinition( def.id )
					) {
						this.enqueue( {
							projectId,
							definitionId: def.id,
							title: def.title,
							kind: 'scheduled',
							prompt: def.instructions,
						} );
					}
				}
				// Mark evaluated regardless, so a once-due slot never re-fires.
				this.patchDefinition( projectId, def.id, {
					lastScheduledCheckAt: now,
				} );
			}
		}
	}

	private hasActiveRunForDefinition( defId: string ): boolean {
		for ( const live of this.live.values() ) {
			if ( live.run.definitionId === defId ) {
				return true;
			}
		}
		return false;
	}

	private patchDefinition(
		projectId: string,
		id: string,
		patch: Partial< TaskDefinition >
	): void {
		const project = getProject( projectId );
		if ( ! project ) {
			return;
		}
		const updated = patchTask( project.path, id, patch );
		if ( updated ) {
			this.replaceInMemory( projectId, updated );
		}
	}

	private replaceInMemory( projectId: string, def: TaskDefinition ): void {
		const list = this.definitions.get( projectId ) ?? [];
		const idx = list.findIndex( ( d ) => d.id === def.id );
		if ( idx >= 0 ) {
			list[ idx ] = def;
		} else {
			list.push( def );
		}
		this.definitions.set( projectId, list );
	}

	private persistRun( run: TaskRun ): void {
		const project = getProject( run.projectId );
		if ( project ) {
			upsertRun( project.path, run );
		}
	}

	private emitEvent( event: TasksEvent ): void {
		for ( const wc of this.windows ) {
			tasksOnEvent.emit( wc, event );
		}
	}
}

let instance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
	if ( ! instance ) {
		instance = new TaskManager();
	}
	return instance;
}
