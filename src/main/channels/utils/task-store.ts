/**
 * Persistence for the task system, per project, under `<project>/.studio-write/`:
 *
 *   tasks.json               { tasks: TaskDefinition[] }  — saved definitions
 *   task-runs.json           { runs: TaskRun[] }          — lightweight run index
 *   task-runs/<runId>.jsonl  PersistedMessage[]           — run transcript
 *
 * Mirrors `chat-store.ts` (the chats.json + chats/<id>.jsonl split) so the run
 * transcript reuses the chat-message format and the renderer's ChatTranscript.
 * Pure fs helpers — no SDK imports. Parse failures degrade to empty results.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PersistedMessage, TaskDefinition, TaskRun } from '../../../types';

const STORE_DIR = '.studio-write';
const TASKS_FILE = 'tasks.json';
const RUNS_FILE = 'task-runs.json';
const RUNS_DIR = 'task-runs';

function storeDir( projectPath: string ): string {
	return path.join( projectPath, STORE_DIR );
}

function tasksPath( projectPath: string ): string {
	return path.join( storeDir( projectPath ), TASKS_FILE );
}

function runsIndexPath( projectPath: string ): string {
	return path.join( storeDir( projectPath ), RUNS_FILE );
}

export function runLogPath( projectPath: string, runId: string ): string {
	return path.join( storeDir( projectPath ), RUNS_DIR, `${ runId }.jsonl` );
}

function ensureDir( dir: string ): void {
	fs.mkdirSync( dir, { recursive: true } );
}

// --- Task definitions ---

export function readTasks( projectPath: string ): TaskDefinition[] {
	const file = tasksPath( projectPath );
	if ( ! fs.existsSync( file ) ) {
		return [];
	}
	try {
		const parsed = JSON.parse( fs.readFileSync( file, 'utf-8' ) ) as {
			tasks?: unknown[];
		};
		if ( ! Array.isArray( parsed.tasks ) ) {
			return [];
		}
		const out: TaskDefinition[] = [];
		for ( const raw of parsed.tasks ) {
			const res = TaskDefinition.safeParse( raw );
			if ( res.success ) {
				out.push( res.data );
			}
		}
		return out;
	} catch {
		return [];
	}
}

export function writeTasks(
	projectPath: string,
	tasks: TaskDefinition[]
): void {
	const file = tasksPath( projectPath );
	ensureDir( path.dirname( file ) );
	fs.writeFileSync( file, JSON.stringify( { tasks }, null, 2 ), 'utf-8' );
}

export function upsertTask(
	projectPath: string,
	task: TaskDefinition
): TaskDefinition {
	const tasks = readTasks( projectPath );
	const idx = tasks.findIndex( ( t ) => t.id === task.id );
	if ( idx >= 0 ) {
		tasks[ idx ] = task;
	} else {
		tasks.push( task );
	}
	writeTasks( projectPath, tasks );
	return task;
}

// Shallow-merges `patch` into the stored definition. Callers own `updatedAt` —
// scheduler bookkeeping (lastRunAt/lastScheduledCheckAt) intentionally does not
// count as a user edit.
export function patchTask(
	projectPath: string,
	id: string,
	patch: Partial< TaskDefinition >
): TaskDefinition | null {
	const tasks = readTasks( projectPath );
	const idx = tasks.findIndex( ( t ) => t.id === id );
	if ( idx < 0 ) {
		return null;
	}
	const next = { ...tasks[ idx ], ...patch };
	tasks[ idx ] = next;
	writeTasks( projectPath, tasks );
	return next;
}

export function deleteTask( projectPath: string, id: string ): boolean {
	const tasks = readTasks( projectPath );
	const next = tasks.filter( ( t ) => t.id !== id );
	const removed = next.length !== tasks.length;
	if ( removed ) {
		writeTasks( projectPath, next );
	}
	return removed;
}

export function deleteRunsByDefinition(
	projectPath: string,
	definitionId: string
): string[] {
	const runs = readRuns( projectPath );
	const kept: TaskRun[] = [];
	const removedIds: string[] = [];
	for ( const run of runs ) {
		if ( run.definitionId === definitionId ) {
			removedIds.push( run.id );
		} else {
			kept.push( run );
		}
	}
	if ( removedIds.length > 0 ) {
		writeRuns( projectPath, kept );
		for ( const runId of removedIds ) {
			const log = runLogPath( projectPath, runId );
			if ( fs.existsSync( log ) ) {
				fs.rmSync( log, { force: true } );
			}
		}
	}
	return removedIds;
}

// --- Task runs (index) ---

export function readRuns( projectPath: string ): TaskRun[] {
	const file = runsIndexPath( projectPath );
	if ( ! fs.existsSync( file ) ) {
		return [];
	}
	try {
		const parsed = JSON.parse( fs.readFileSync( file, 'utf-8' ) ) as {
			runs?: unknown[];
		};
		if ( ! Array.isArray( parsed.runs ) ) {
			return [];
		}
		const out: TaskRun[] = [];
		for ( const raw of parsed.runs ) {
			const res = TaskRun.safeParse( raw );
			if ( res.success ) {
				out.push( res.data );
			}
		}
		return out;
	} catch {
		return [];
	}
}

export function writeRuns( projectPath: string, runs: TaskRun[] ): void {
	const file = runsIndexPath( projectPath );
	ensureDir( path.dirname( file ) );
	fs.writeFileSync( file, JSON.stringify( { runs }, null, 2 ), 'utf-8' );
}

export function upsertRun( projectPath: string, run: TaskRun ): TaskRun {
	const runs = readRuns( projectPath );
	const idx = runs.findIndex( ( r ) => r.id === run.id );
	if ( idx >= 0 ) {
		runs[ idx ] = run;
	} else {
		runs.push( run );
	}
	writeRuns( projectPath, runs );
	return run;
}

// Caps retained runs per project: keeps the most recent `keep` by createdAt,
// drops the rest from the index and deletes their transcript files.
export function pruneRuns( projectPath: string, keep = 50 ): void {
	const runs = readRuns( projectPath );
	if ( runs.length <= keep ) {
		return;
	}
	const sorted = [ ...runs ].sort( ( a, b ) => b.createdAt - a.createdAt );
	const kept = sorted.slice( 0, keep );
	const dropped = sorted.slice( keep );
	writeRuns( projectPath, kept );
	for ( const run of dropped ) {
		const log = runLogPath( projectPath, run.id );
		if ( fs.existsSync( log ) ) {
			fs.rmSync( log, { force: true } );
		}
	}
}

// --- Task run transcript (jsonl) ---

export function appendRunMessage(
	projectPath: string,
	runId: string,
	message: PersistedMessage
): void {
	const file = runLogPath( projectPath, runId );
	ensureDir( path.dirname( file ) );
	fs.appendFileSync( file, JSON.stringify( message ) + '\n', 'utf-8' );
}

export function readRunMessages(
	projectPath: string,
	runId: string
): PersistedMessage[] {
	const file = runLogPath( projectPath, runId );
	if ( ! fs.existsSync( file ) ) {
		return [];
	}
	let raw: string;
	try {
		raw = fs.readFileSync( file, 'utf-8' );
	} catch {
		return [];
	}
	const out: PersistedMessage[] = [];
	for ( const line of raw.split( /\r?\n/ ) ) {
		if ( line.length === 0 ) {
			continue;
		}
		try {
			// Cast rather than zod-validate: PersistedMessage is a
			// discriminated union with a preprocessed member, which
			// `safeParse` cannot resolve. Mirrors chat-load.ts.
			out.push( JSON.parse( line ) as PersistedMessage );
		} catch {
			// Skip a malformed line rather than failing the whole transcript.
		}
	}
	return out;
}
