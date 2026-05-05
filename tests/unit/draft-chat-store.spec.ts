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
	ensureDraftChat,
	isProjectChat,
	listDraftChats,
	readMetaFile,
	touchMeta,
} from '../../src/main/channels/utils/chat-store';

describe( 'draft chat helpers', () => {
	beforeEach( () => {
		mocks.projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-test-draft-chat-' )
		);
	} );

	test( 'ensureDraftChat creates a chat when none exists for the draft', () => {
		const meta = ensureDraftChat( mocks.projectPath, 'drafts/post.md' );
		expect( meta.draftRelPath ).toBe( 'drafts/post.md' );
		expect( meta.id ).toMatch( /^[0-9a-f-]{36}$/ );
		const stored = readMetaFile( mocks.projectPath ).chats;
		expect( stored ).toHaveLength( 1 );
		expect( stored[ 0 ].draftRelPath ).toBe( 'drafts/post.md' );
	} );

	test( 'ensureDraftChat returns the existing chat on the second call', () => {
		const first = ensureDraftChat( mocks.projectPath, 'drafts/post.md' );
		const second = ensureDraftChat( mocks.projectPath, 'drafts/post.md' );
		expect( second.id ).toBe( first.id );
		expect( readMetaFile( mocks.projectPath ).chats ).toHaveLength( 1 );
	} );

	test( 'different drafts get independent chats', () => {
		const a = ensureDraftChat( mocks.projectPath, 'drafts/a.md' );
		const b = ensureDraftChat( mocks.projectPath, 'drafts/b.md' );
		expect( a.id ).not.toBe( b.id );
		expect( a.draftRelPath ).toBe( 'drafts/a.md' );
		expect( b.draftRelPath ).toBe( 'drafts/b.md' );
	} );

	test( 'listDraftChats scopes by draft path and orders by createdAt', () => {
		// Seed with a project chat (no draftRelPath) — it must NOT show up.
		touchMeta( mocks.projectPath, 'plain-chat', { title: 'Plain' } );
		const a1 = ensureDraftChat( mocks.projectPath, 'drafts/a.md' );
		ensureDraftChat( mocks.projectPath, 'drafts/b.md' );
		const list = listDraftChats( mocks.projectPath, 'drafts/a.md' );
		expect( list.map( ( c ) => c.id ) ).toEqual( [ a1.id ] );
	} );

	test( 'isProjectChat is false for chats with draftRelPath set', () => {
		const draftChat = ensureDraftChat( mocks.projectPath, 'drafts/x.md' );
		const projectChat = touchMeta( mocks.projectPath, 'p1', {} );
		expect( isProjectChat( draftChat ) ).toBe( false );
		expect( isProjectChat( projectChat ) ).toBe( true );
	} );

	test( 'pre-existing chats.json without draftRelPath stays a project chat', () => {
		fs.mkdirSync( path.join( mocks.projectPath, '.studio-write' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( mocks.projectPath, '.studio-write', 'chats.json' ),
			JSON.stringify( {
				chats: [
					{
						id: 'legacy',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: null,
					},
				],
			} )
		);
		const meta = readMetaFile( mocks.projectPath );
		expect( meta.chats[ 0 ].draftRelPath ).toBeUndefined();
		expect( isProjectChat( meta.chats[ 0 ] ) ).toBe( true );
	} );
} );
