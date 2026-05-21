import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub Electron — wordpress-store reads app.getPath + safeStorage on import.
const mockUserData = { dir: '' };
vi.mock( 'electron', () => ( {
	app: { getPath: () => mockUserData.dir },
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: ( s: string ) => Buffer.from( `enc:${ s }`, 'utf-8' ),
		decryptString: ( buf: Buffer ) =>
			buf.toString( 'utf-8' ).replace( /^enc:/, '' ),
	},
} ) );

// Stub the project lookup so the publish handler resolves our tmp dir.
const mockProject = { value: null as { id: string; path: string } | null };
vi.mock( '../../src/main/channels/utils/project-get', () => ( {
	getProject: ( id: string ) =>
		mockProject.value && mockProject.value.id === id
			? mockProject.value
			: null,
} ) );

// Capture wpFetch calls and let each test stage the response.
const fetchCalls: Array< { path: string; init?: RequestInit } > = [];
let nextFetchResponse:
	| { ok: true; data: unknown; status: number }
	| { ok: false; reason: string; status?: number; message?: string } = {
	ok: true,
	data: {
		id: 7,
		link: 'https://example.com/?p=7',
		status: 'publish',
	},
	status: 200,
};
vi.mock( '../../src/main/channels/utils/wordpress-client', () => ( {
	wpFetch: ( _conn: unknown, apiPath: string, init?: RequestInit ) => {
		fetchCalls.push( { path: apiPath, init } );
		return Promise.resolve( nextFetchResponse );
	},
} ) );

import {
	listWordpressSitesTool,
	makePublishToWordpressTool,
} from '../../src/main/channels/utils/task-tools/wordpress';
import {
	addConnection,
	encryptSecret,
	listConnections,
} from '../../src/main/channels/utils/wordpress-store';
import type { WordpressConnection } from '../../src/types';

let projectDir: string;

const connection: WordpressConnection = {
	id: 'conn-1',
	label: 'My Blog',
	siteUrl: 'https://example.com',
	kind: 'app-password',
	username: 'admin',
	secretCipher: encryptSecret( 'app-password' ),
	createdAt: 1700000000000,
};

beforeEach( () => {
	mockUserData.dir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'wp-mcp-userdata-' )
	);
	projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-mcp-proj-' ) );
	fs.mkdirSync( path.join( projectDir, 'drafts' ), { recursive: true } );
	mockProject.value = { id: 'proj-1', path: projectDir };
	fetchCalls.length = 0;
	nextFetchResponse = {
		ok: true,
		data: {
			id: 7,
			link: 'https://example.com/?p=7',
			status: 'publish',
		},
		status: 200,
	};
} );

afterEach( () => {
	mockProject.value = null;
	try {
		fs.rmSync( projectDir, { recursive: true, force: true } );
		fs.rmSync( mockUserData.dir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

function textOf( result: {
	content: Array< { type: string; text?: string } >;
} ): string {
	return result.content.map( ( c ) => c.text ?? '' ).join( '\n' );
}

describe( 'list_wordpress_sites tool', () => {
	it( 'returns an empty-list message when no connections exist', async () => {
		const result = await listWordpressSitesTool.handler( {}, undefined );
		expect( result.isError ).toBeFalsy();
		expect( textOf( result ) ).toContain( 'No WordPress sites' );
	} );

	it( 'returns the connections as a JSON array', async () => {
		addConnection( connection );
		// Sanity: the store should now hold one entry.
		expect( listConnections() ).toHaveLength( 1 );
		const result = await listWordpressSitesTool.handler( {}, undefined );
		expect( result.isError ).toBeFalsy();
		const parsed = JSON.parse( textOf( result ) ) as Array< {
			id: string;
			label: string;
			url: string;
		} >;
		expect( parsed ).toEqual( [
			{
				id: 'conn-1',
				label: 'My Blog',
				url: 'https://example.com',
			},
		] );
	} );
} );

describe( 'publish_to_wordpress tool', () => {
	function writeDraft(
		filename: string,
		body: string,
		fm: Record< string, unknown > = {}
	): void {
		fs.writeFileSync(
			path.join( projectDir, 'drafts', filename ),
			matter.stringify( body, fm ),
			'utf-8'
		);
	}

	const publishTool = makePublishToWordpressTool( { projectId: 'proj-1' } );

	it( 'publishes a draft and returns a success summary with the post URL', async () => {
		addConnection( connection );
		writeDraft( 'hello.md', '# Hello\n\nFirst.', { title: 'Hello' } );

		const result = await publishTool.handler(
			{
				relPath: 'hello.md',
				connectionId: 'conn-1',
				folder: 'drafts',
			},
			undefined
		);

		expect( result.isError ).toBeFalsy();
		const text = textOf( result );
		expect( text ).toContain( 'Published to My Blog' );
		expect( text ).toContain( 'https://example.com/?p=7' );
		// File was auto-moved into done/.
		expect( text ).toContain( 'drafts/hello.md → done/hello.md' );
		expect(
			fs.existsSync( path.join( projectDir, 'done', 'hello.md' ) )
		).toBe( true );
		expect(
			fs.existsSync( path.join( projectDir, 'drafts', 'hello.md' ) )
		).toBe( false );
	} );

	it( 'returns a connection-not-found error when the connectionId is unknown', async () => {
		writeDraft( 'orphan.md', 'body' );

		const result = await publishTool.handler(
			{
				relPath: 'orphan.md',
				connectionId: 'does-not-exist',
				folder: 'drafts',
			},
			undefined
		);

		expect( result.isError ).toBe( true );
		expect( textOf( result ) ).toContain( 'No WordPress connection' );
		// No HTTP call was attempted.
		expect( fetchCalls ).toHaveLength( 0 );
	} );

	it( 'returns a draft-not-found error when the file is missing', async () => {
		addConnection( connection );

		const result = await publishTool.handler(
			{
				relPath: 'missing.md',
				connectionId: 'conn-1',
				folder: 'drafts',
			},
			undefined
		);

		expect( result.isError ).toBe( true );
		expect( textOf( result ) ).toContain(
			"Couldn't read the draft file from disk"
		);
		expect( fetchCalls ).toHaveLength( 0 );
	} );

	it( 'maps wp transport errors to readable messages', async () => {
		addConnection( connection );
		writeDraft( 'bad.md', 'body', { title: 'Bad' } );
		nextFetchResponse = {
			ok: false,
			reason: 'unauthorized',
			status: 401,
			message: 'invalid creds',
		};

		const result = await publishTool.handler(
			{
				relPath: 'bad.md',
				connectionId: 'conn-1',
				folder: 'drafts',
			},
			undefined
		);

		expect( result.isError ).toBe( true );
		expect( textOf( result ) ).toContain(
			'WordPress refused the credentials'
		);
	} );
} );
