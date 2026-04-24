import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { folderPath: '' } ) );

vi.mock( '../../src/main/services/folderService', () => ( {
	getFolder: ( id: string ) =>
		id === 'folder-a'
			? { id: 'folder-a', path: mocks.folderPath, label: 'a' }
			: null,
} ) );

import {
	createChat,
	listChats,
	getSessionId,
	setSessionId,
	DEFAULT_CHAT_ID,
	appendMessage,
} from '../../src/main/services/chatService';

const FOLDER_ID = 'folder-a';

describe( 'chatService: multi-chat per folder', () => {
	beforeEach( () => {
		mocks.folderPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'cs-test-folder-' )
		);
	} );

	test( 'createChat produces distinct ids and appears in listChats', () => {
		const a = createChat( FOLDER_ID, { kind: 'ideas', title: 'Ideas' } );
		const b = createChat( FOLDER_ID, { kind: 'draft', title: 'Draft' } );
		expect( a ).not.toBeNull();
		expect( b ).not.toBeNull();
		expect( a!.id ).not.toBe( b!.id );
		expect( a!.kind ).toBe( 'ideas' );
		expect( b!.kind ).toBe( 'draft' );

		const list = listChats( FOLDER_ID );
		expect( list ).toHaveLength( 2 );
		expect( list.map( ( c ) => c.id ).sort() ).toEqual(
			[ a!.id, b!.id ].sort()
		);
	} );

	test( 'setSessionId is keyed per chat and does not collide across chats', () => {
		const a = createChat( FOLDER_ID, { kind: 'general' } )!;
		const b = createChat( FOLDER_ID, { kind: 'general' } )!;
		setSessionId( FOLDER_ID, a.id, 'session-a' );
		setSessionId( FOLDER_ID, b.id, 'session-b' );
		expect( getSessionId( FOLDER_ID, a.id ) ).toBe( 'session-a' );
		expect( getSessionId( FOLDER_ID, b.id ) ).toBe( 'session-b' );
	} );

	test( 'appendMessage writes to per-chat jsonl file', () => {
		const a = createChat( FOLDER_ID, { kind: 'general' } )!;
		const b = createChat( FOLDER_ID, { kind: 'general' } )!;
		appendMessage( FOLDER_ID, a.id, {
			kind: 'user',
			id: 'm1',
			text: 'hello-a',
			at: 1,
		} );
		appendMessage( FOLDER_ID, b.id, {
			kind: 'user',
			id: 'm2',
			text: 'hello-b',
			at: 2,
		} );
		const aLog = fs.readFileSync(
			path.join(
				mocks.folderPath,
				'.creator-studio',
				'chats',
				`${ a.id }.jsonl`
			),
			'utf-8'
		);
		const bLog = fs.readFileSync(
			path.join(
				mocks.folderPath,
				'.creator-studio',
				'chats',
				`${ b.id }.jsonl`
			),
			'utf-8'
		);
		expect( aLog ).toContain( 'hello-a' );
		expect( aLog ).not.toContain( 'hello-b' );
		expect( bLog ).toContain( 'hello-b' );
		expect( bLog ).not.toContain( 'hello-a' );
	} );

	test( 'listChats normalizes legacy entries that predate the kind field', () => {
		// Write a pre-migration chats.json: no `kind` key.
		const legacyChat = {
			id: DEFAULT_CHAT_ID,
			sessionId: 'legacy-session',
			createdAt: 1000,
			lastMessageAt: 2000,
		};
		fs.mkdirSync( path.join( mocks.folderPath, '.creator-studio' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( mocks.folderPath, '.creator-studio', 'chats.json' ),
			JSON.stringify( { chats: [ legacyChat ] } )
		);
		const list = listChats( FOLDER_ID );
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].id ).toBe( DEFAULT_CHAT_ID );
		expect( list[ 0 ].kind ).toBe( 'general' );
		expect( list[ 0 ].sessionId ).toBe( 'legacy-session' );
	} );

	test( 'createChat returns null for an unknown folder id', () => {
		expect( createChat( 'nope', { kind: 'general' } ) ).toBeNull();
		expect( listChats( 'nope' ) ).toEqual( [] );
	} );
} );
