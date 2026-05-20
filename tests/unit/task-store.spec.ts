import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test } from 'vitest';

import {
	appendRunMessage,
	deleteTask,
	patchTask,
	pruneRuns,
	readRunMessages,
	readRuns,
	readTasks,
	upsertRun,
	upsertTask,
	writeTasks,
} from '../../src/main/channels/utils/task-store';
import type { TaskDefinition, TaskRun } from '../../src/types';

let projectPath: string;

beforeEach( () => {
	projectPath = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-task-store-' ) );
} );

function makeDef(
	id: string,
	over: Partial< TaskDefinition > = {}
): TaskDefinition {
	return {
		id,
		projectId: 'p1',
		title: `Task ${ id }`,
		description: '',
		instructions: 'do the thing',
		schedule: { kind: 'manual' },
		enabled: true,
		createdAt: 1000,
		updatedAt: 1000,
		lastRunAt: null,
		lastScheduledCheckAt: null,
		...over,
	};
}

function makeRun( id: string, over: Partial< TaskRun > = {} ): TaskRun {
	return {
		id,
		projectId: 'p1',
		definitionId: null,
		title: `Run ${ id }`,
		kind: 'manual',
		status: 'done',
		createdAt: 1000,
		startedAt: null,
		endedAt: null,
		summary: null,
		error: null,
		pendingPermissionCount: 0,
		...over,
	};
}

describe( 'task-store definitions', () => {
	test( 'reads back what was written', () => {
		expect( readTasks( projectPath ) ).toEqual( [] );
		const def = makeDef( 'a' );
		writeTasks( projectPath, [ def ] );
		expect( readTasks( projectPath ) ).toEqual( [ def ] );
	} );

	test( 'upsertTask inserts then updates in place', () => {
		upsertTask( projectPath, makeDef( 'a', { title: 'first' } ) );
		upsertTask( projectPath, makeDef( 'b' ) );
		upsertTask( projectPath, makeDef( 'a', { title: 'second' } ) );
		const tasks = readTasks( projectPath );
		expect( tasks ).toHaveLength( 2 );
		expect( tasks.find( ( t ) => t.id === 'a' )?.title ).toBe( 'second' );
	} );

	test( 'patchTask merges fields; deleteTask removes', () => {
		upsertTask( projectPath, makeDef( 'a' ) );
		const patched = patchTask( projectPath, 'a', { lastRunAt: 5000 } );
		expect( patched?.lastRunAt ).toBe( 5000 );
		expect( patchTask( projectPath, 'missing', {} ) ).toBeNull();
		expect( deleteTask( projectPath, 'a' ) ).toBe( true );
		expect( readTasks( projectPath ) ).toEqual( [] );
	} );
} );

describe( 'task-store runs', () => {
	test( 'upsertRun + readRuns round-trip', () => {
		upsertRun( projectPath, makeRun( 'r1' ) );
		upsertRun( projectPath, makeRun( 'r1', { status: 'error' } ) );
		const runs = readRuns( projectPath );
		expect( runs ).toHaveLength( 1 );
		expect( runs[ 0 ].status ).toBe( 'error' );
	} );

	test( 'appendRunMessage + readRunMessages round-trip', () => {
		appendRunMessage( projectPath, 'r1', {
			kind: 'user',
			id: 'm1',
			text: 'hello',
			attachments: [],
			selections: [],
			at: 1,
		} );
		appendRunMessage( projectPath, 'r1', {
			kind: 'assistant',
			id: 'm2',
			text: 'hi',
			at: 2,
		} );
		const msgs = readRunMessages( projectPath, 'r1' );
		expect( msgs.map( ( m ) => m.kind ) ).toEqual( [
			'user',
			'assistant',
		] );
	} );

	test( 'pruneRuns keeps the most recent N and deletes dropped logs', () => {
		for ( let i = 0; i < 5; i++ ) {
			upsertRun( projectPath, makeRun( `r${ i }`, { createdAt: i } ) );
			appendRunMessage( projectPath, `r${ i }`, {
				kind: 'assistant',
				id: `m${ i }`,
				text: 'x',
				at: i,
			} );
		}
		pruneRuns( projectPath, 2 );
		expect(
			readRuns( projectPath )
				.map( ( r ) => r.id )
				.sort()
		).toEqual( [ 'r3', 'r4' ] );
		expect( readRunMessages( projectPath, 'r0' ) ).toEqual( [] );
		expect( readRunMessages( projectPath, 'r4' ) ).toHaveLength( 1 );
	} );
} );
