import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { projectPath: '' } ) );

vi.mock( '../../src/main/channels/utils/project-get', () => ( {
	getProject: ( id: string ) =>
		id === 'project-a'
			? { id: 'project-a', path: mocks.projectPath, label: 'a' }
			: null,
} ) );

import {
	chatLogPath,
	DEFAULT_CHAT_ID,
	ensureDir,
	readMetaFile,
	resolveProjectPath,
	touchMeta,
} from '../../src/main/channels/utils/chat-store';
import type { ChatKind } from '../../src/types';

const PROJECT_ID = 'project-a';

function createChat(
	projectId: string,
	kind: ChatKind = 'general',
	title?: string
) {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	return touchMeta( projectPath, randomUUID(), { kind, title } );
}

function listChats( projectId: string ) {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return [];
	}
	return [ ...readMetaFile( projectPath ).chats ].sort(
		( a, b ) => a.createdAt - b.createdAt
	);
}

describe( 'chat-store: multi-chat per project', () => {
	beforeEach( () => {
		mocks.projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-test-project-' )
		);
	} );

	test( 'touchMeta produces distinct ids and they appear in readMetaFile', () => {
		const a = createChat( PROJECT_ID, 'ideas', 'Ideas' );
		const b = createChat( PROJECT_ID, 'draft', 'Draft' );
		expect( a ).not.toBeNull();
		expect( b ).not.toBeNull();
		expect( a!.id ).not.toBe( b!.id );
		expect( a!.kind ).toBe( 'ideas' );
		expect( b!.kind ).toBe( 'draft' );

		const list = listChats( PROJECT_ID );
		expect( list ).toHaveLength( 2 );
		expect( list.map( ( c ) => c.id ).sort() ).toEqual(
			[ a!.id, b!.id ].sort()
		);
	} );

	test( 'sessionId patches are keyed per chat and do not collide', () => {
		const a = createChat( PROJECT_ID )!;
		const b = createChat( PROJECT_ID )!;
		touchMeta( mocks.projectPath, a.id, { sessionId: 'session-a' } );
		touchMeta( mocks.projectPath, b.id, { sessionId: 'session-b' } );
		const meta = readMetaFile( mocks.projectPath );
		expect( meta.chats.find( ( c ) => c.id === a.id )?.sessionId ).toBe(
			'session-a'
		);
		expect( meta.chats.find( ( c ) => c.id === b.id )?.sessionId ).toBe(
			'session-b'
		);
	} );

	test( 'each chat writes to its own jsonl file under .studio-write/chats/', () => {
		const a = createChat( PROJECT_ID )!;
		const b = createChat( PROJECT_ID )!;
		const aPath = chatLogPath( mocks.projectPath, a.id );
		const bPath = chatLogPath( mocks.projectPath, b.id );
		ensureDir( path.dirname( aPath ) );
		fs.appendFileSync(
			aPath,
			JSON.stringify( {
				kind: 'user',
				id: 'm1',
				text: 'hello-a',
				at: 1,
			} ) + '\n',
			'utf-8'
		);
		fs.appendFileSync(
			bPath,
			JSON.stringify( {
				kind: 'user',
				id: 'm2',
				text: 'hello-b',
				at: 2,
			} ) + '\n',
			'utf-8'
		);
		const aLog = fs.readFileSync( aPath, 'utf-8' );
		const bLog = fs.readFileSync( bPath, 'utf-8' );
		expect( aLog ).toContain( 'hello-a' );
		expect( aLog ).not.toContain( 'hello-b' );
		expect( bLog ).toContain( 'hello-b' );
		expect( bLog ).not.toContain( 'hello-a' );
	} );

	test( 'readMetaFile normalizes legacy entries that predate the kind field', () => {
		// Write a pre-migration chats.json: no `kind` key.
		const legacyChat = {
			id: DEFAULT_CHAT_ID,
			sessionId: 'legacy-session',
			createdAt: 1000,
			lastMessageAt: 2000,
		};
		fs.mkdirSync( path.join( mocks.projectPath, '.studio-write' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( mocks.projectPath, '.studio-write', 'chats.json' ),
			JSON.stringify( { chats: [ legacyChat ] } )
		);
		const list = listChats( PROJECT_ID );
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].id ).toBe( DEFAULT_CHAT_ID );
		expect( list[ 0 ].kind ).toBe( 'general' );
		expect( list[ 0 ].sessionId ).toBe( 'legacy-session' );
	} );

	test( 'resolveProjectPath returns null for an unknown project id', () => {
		expect( resolveProjectPath( 'nope' ) ).toBeNull();
		expect( createChat( 'nope' ) ).toBeNull();
		expect( listChats( 'nope' ) ).toEqual( [] );
	} );
} );
