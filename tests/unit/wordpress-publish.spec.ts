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
	| {
			ok: false;
			reason: string;
			status?: number;
	  } = {
	ok: true,
	data: {
		id: 42,
		link: 'https://example.com/?p=42',
		status: 'publish',
		modified: '2026-05-16T12:00:00',
	},
	status: 200,
};
vi.mock( '../../src/main/channels/utils/wordpress-client', () => ( {
	wpFetch: ( _conn: unknown, apiPath: string, init?: RequestInit ) => {
		fetchCalls.push( { path: apiPath, init } );
		return Promise.resolve( nextFetchResponse );
	},
} ) );

import { wordpressPublish } from '../../src/main/channels/wordpress-publish';
import {
	addConnection,
	encryptSecret,
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
		path.join( os.tmpdir(), 'wp-publish-userdata-' )
	);
	projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-publish-proj-' ) );
	fs.mkdirSync( path.join( projectDir, 'drafts' ), { recursive: true } );
	mockProject.value = { id: 'proj-1', path: projectDir };
	addConnection( connection );
	fetchCalls.length = 0;
	nextFetchResponse = {
		ok: true,
		data: {
			id: 42,
			link: 'https://example.com/?p=42',
			status: 'publish',
			modified: '2026-05-16T12:00:00',
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

function writeDraft(
	filename: string,
	body: string,
	fm: Record< string, unknown > = {}
): void {
	const file = matter.stringify( body, fm );
	fs.writeFileSync(
		path.join( projectDir, 'drafts', filename ),
		file,
		'utf-8'
	);
}

// After a successful publish the file gets moved drafts/ → done/, so
// we check both locations when reading frontmatter back. Tests that
// run with `folder: 'done'` (re-publish path) leave the file in
// done/ from the start.
function readFrontmatter( filename: string ): Record< string, unknown > {
	const donePath = path.join( projectDir, 'done', filename );
	const draftsPath = path.join( projectDir, 'drafts', filename );
	const target = fs.existsSync( donePath ) ? donePath : draftsPath;
	const raw = fs.readFileSync( target, 'utf-8' );
	return matter( raw ).data as Record< string, unknown >;
}

async function invokePublish( filename: string ): Promise< unknown > {
	return wordpressPublish.invoke(
		{ sender: { isDestroyed: () => true, send: () => {} } } as never,
		{
			projectId: 'proj-1',
			relPath: filename,
			folder: 'drafts',
			connectionId: 'conn-1',
		}
	);
}

describe( 'wordpress:publish', () => {
	it( 'POSTs a new post and writes wp_post_id back into frontmatter', async () => {
		writeDraft( 'hello.md', '# Hello\n\nFirst post.', { title: 'Hello' } );
		const result = ( await invokePublish( 'hello.md' ) ) as {
			ok: boolean;
			postId?: number;
			link?: string;
		};
		expect( result.ok ).toBe( true );
		expect( result.postId ).toBe( 42 );
		// First publish is a POST against /wp/v2/posts (no id appended).
		expect( fetchCalls ).toHaveLength( 1 );
		expect( fetchCalls[ 0 ].path ).toBe( 'wp/v2/posts' );
		expect( fetchCalls[ 0 ].init?.method ).toBe( 'POST' );
		const body = JSON.parse( fetchCalls[ 0 ].init?.body as string );
		expect( body.title ).toBe( 'Hello' );
		expect( body.status ).toBe( 'publish' );
		expect( body.content ).toContain( '<h1>Hello</h1>' );
		expect( body.content ).toContain( '<p>First post.</p>' );
		// Frontmatter merged: wp_post_id, wp_link, wp_status, wp_connection_id.
		const fm = readFrontmatter( 'hello.md' );
		expect( fm.wp_post_id ).toBe( 42 );
		expect( fm.wp_link ).toBe( 'https://example.com/?p=42' );
		expect( fm.wp_status ).toBe( 'publish' );
		expect( fm.wp_connection_id ).toBe( 'conn-1' );
		expect( fm.title ).toBe( 'Hello' );
	} );

	it( 'PUTs to /wp/v2/posts/<id> when frontmatter already binds to the same connection', async () => {
		writeDraft( 'existing.md', 'updated body', {
			title: 'Existing',
			wp_connection_id: 'conn-1',
			wp_post_id: 99,
		} );
		nextFetchResponse = {
			ok: true,
			data: {
				id: 99,
				link: 'https://example.com/?p=99',
				status: 'publish',
			},
			status: 200,
		};
		const result = ( await invokePublish( 'existing.md' ) ) as {
			ok: boolean;
			postId?: number;
		};
		expect( result.ok ).toBe( true );
		expect( result.postId ).toBe( 99 );
		expect( fetchCalls[ 0 ].path ).toBe( 'wp/v2/posts/99' );
		expect( fetchCalls[ 0 ].init?.method ).toBe( 'PUT' );
	} );

	it( 'treats wp_post_id as fresh when wp_connection_id points elsewhere', async () => {
		writeDraft( 'cross.md', 'body', {
			title: 'Cross-site',
			wp_connection_id: 'other-conn',
			wp_post_id: 7,
		} );
		await invokePublish( 'cross.md' );
		// Should POST a new post against /wp/v2/posts (no id), because
		// the existing wp_post_id belongs to a different connection.
		expect( fetchCalls[ 0 ].path ).toBe( 'wp/v2/posts' );
		expect( fetchCalls[ 0 ].init?.method ).toBe( 'POST' );
	} );

	it( 'returns connection-not-found when the connection id is unknown', async () => {
		writeDraft( 'lone.md', 'body' );
		const result = ( await wordpressPublish.invoke(
			{ sender: { isDestroyed: () => true, send: () => {} } } as never,
			{
				projectId: 'proj-1',
				relPath: 'lone.md',
				folder: 'drafts',
				connectionId: 'nope',
			}
		) ) as { ok: boolean; reason?: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'connection-not-found' );
	} );

	it( 'moves drafts/<file> to done/<file> on successful publish', async () => {
		writeDraft( 'shipme.md', 'body', { title: 'Ship me' } );
		const result = ( await invokePublish( 'shipme.md' ) ) as {
			ok: boolean;
			movedToDone?: { relPath: string } | null;
		};
		expect( result.ok ).toBe( true );
		expect( result.movedToDone ).toEqual( { relPath: 'shipme.md' } );
		expect(
			fs.existsSync( path.join( projectDir, 'drafts', 'shipme.md' ) )
		).toBe( false );
		expect(
			fs.existsSync( path.join( projectDir, 'done', 'shipme.md' ) )
		).toBe( true );
		// Frontmatter (including wp_post_id) lands in the done copy.
		const fm = readFrontmatter( 'shipme.md' );
		expect( fm.wp_post_id ).toBe( 42 );
	} );

	it( 'skips the move when re-publishing a file already in done/', async () => {
		fs.mkdirSync( path.join( projectDir, 'done' ), { recursive: true } );
		const fm = matter.stringify( 'body', {
			title: 'Already done',
			wp_connection_id: 'conn-1',
			wp_post_id: 99,
		} );
		fs.writeFileSync(
			path.join( projectDir, 'done', 'already.md' ),
			fm,
			'utf-8'
		);
		nextFetchResponse = {
			ok: true,
			data: {
				id: 99,
				link: 'https://example.com/?p=99',
				status: 'publish',
			},
			status: 200,
		};
		const result = ( await wordpressPublish.invoke(
			{ sender: { isDestroyed: () => true, send: () => {} } } as never,
			{
				projectId: 'proj-1',
				relPath: 'already.md',
				folder: 'done',
				connectionId: 'conn-1',
			}
		) ) as { ok: boolean; movedToDone?: { relPath: string } | null };
		expect( result.ok ).toBe( true );
		expect( result.movedToDone ).toBeNull();
		expect(
			fs.existsSync( path.join( projectDir, 'done', 'already.md' ) )
		).toBe( true );
	} );

	it( 'preserves untouched user frontmatter fields on publish', async () => {
		writeDraft( 'keepme.md', 'body', {
			title: 'Keep Me',
			my_custom: 'value',
			tags: [ 'a', 'b' ],
		} );
		await invokePublish( 'keepme.md' );
		const fm = readFrontmatter( 'keepme.md' );
		expect( fm.my_custom ).toBe( 'value' );
		expect( fm.tags ).toEqual( [ 'a', 'b' ] );
		expect( fm.wp_post_id ).toBe( 42 );
	} );
} );
