import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We don't exercise the real fetch — the upload helper is stubbed
// here so the test focuses on URL collection + body rewriting.
const uploadCalls: Array< { abs: string; filename: string } > = [];
let uploadResponses: Array< {
	ok: boolean;
	id?: number;
	url?: string;
	reason?: string;
} > = [];
vi.mock( '../../src/main/channels/utils/wordpress-media', async () => {
	const actual = await vi.importActual< Record< string, unknown > >(
		'../../src/main/channels/utils/wordpress-media'
	);
	return {
		...actual,
		uploadMediaFile: ( _conn: unknown, abs: string, filename: string ) => {
			uploadCalls.push( { abs, filename } );
			const next = uploadResponses.shift();
			if ( ! next || ! next.ok ) {
				return Promise.resolve( {
					ok: false,
					reason: next?.reason ?? 'http-error',
				} );
			}
			return Promise.resolve( {
				ok: true,
				data: {
					id: next.id!,
					sourceUrl: next.url!,
				},
			} );
		},
	};
} );

import {
	readMediaCache,
	uploadAndRewriteImages,
} from '../../src/main/channels/utils/wordpress-body-images';
import type { WordpressConnection } from '../../src/types';

let projectDir: string;
const connection: WordpressConnection = {
	id: 'c1',
	label: 'Test',
	siteUrl: 'https://example.com',
	kind: 'app-password',
	username: 'admin',
	secretCipher: 'plain:pwd',
	createdAt: 1,
};

beforeEach( () => {
	projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-body-' ) );
	fs.mkdirSync( path.join( projectDir, 'drafts', 'assets' ), {
		recursive: true,
	} );
	uploadCalls.length = 0;
	uploadResponses = [];
} );

afterEach( () => {
	try {
		fs.rmSync( projectDir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

function writeAsset( name: string, bytes: Buffer = Buffer.from( 'x' ) ): void {
	fs.writeFileSync(
		path.join( projectDir, 'drafts', 'assets', name ),
		bytes
	);
}

describe( 'readMediaCache', () => {
	it( 'returns {} when wp_media is missing or wrong shape', () => {
		expect( readMediaCache( {} ) ).toEqual( {} );
		expect( readMediaCache( { wp_media: null } ) ).toEqual( {} );
		expect( readMediaCache( { wp_media: 'nope' } ) ).toEqual( {} );
		expect( readMediaCache( { wp_media: [ 'array' ] } ) ).toEqual( {} );
	} );

	it( 'keeps well-formed entries and drops malformed ones', () => {
		const cache = readMediaCache( {
			wp_media: {
				'assets/a.png': { id: 1, source_url: 'https://x/a.png' },
				'assets/b.png': { id: 'oops', source_url: 'https://x/b.png' },
				'assets/c.png': 'not even an object',
			},
		} );
		expect( cache ).toEqual( {
			'assets/a.png': { id: 1, source_url: 'https://x/a.png' },
		} );
	} );
} );

describe( 'uploadAndRewriteImages', () => {
	it( 'leaves remote and data URLs untouched', async () => {
		const body = [
			'![one](https://example.com/foo.png)',
			'![two](data:image/png;base64,iVBOR...)',
			'<img src="http://other.example/bar.png">',
		].join( '\n' );
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			{}
		);
		expect( uploadCalls ).toHaveLength( 0 );
		expect( result.body ).toBe( body );
		expect( result.cache ).toEqual( {} );
		expect( result.errors ).toEqual( [] );
	} );

	it( 'uploads markdown image references and rewrites the body to the WP source_url', async () => {
		writeAsset( 'abc123.png' );
		uploadResponses = [
			{
				ok: true,
				id: 42,
				url: 'https://wp/wp-content/uploads/abc123.png',
			},
		];
		const body = '![hello](assets/abc123.png)';
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			{}
		);
		expect( uploadCalls ).toHaveLength( 1 );
		expect( uploadCalls[ 0 ].filename ).toBe( 'abc123.png' );
		expect( result.body ).toBe(
			'![hello](https://wp/wp-content/uploads/abc123.png)'
		);
		expect( result.cache[ 'assets/abc123.png' ] ).toEqual( {
			id: 42,
			source_url: 'https://wp/wp-content/uploads/abc123.png',
		} );
	} );

	it( 'rewrites <img src="..."> tags too', async () => {
		writeAsset( 'def.jpg' );
		uploadResponses = [
			{ ok: true, id: 7, url: 'https://wp/uploads/def.jpg' },
		];
		const body = '<img alt="x" src="assets/def.jpg" width="320">';
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			{}
		);
		expect( result.body ).toBe(
			'<img alt="x" src="https://wp/uploads/def.jpg" width="320">'
		);
	} );

	it( 'reuses cached entries and does not re-upload', async () => {
		writeAsset( 'cached.png' );
		const existing = {
			'assets/cached.png': {
				id: 1,
				source_url: 'https://wp/uploads/cached.png',
			},
		};
		const body = '![](assets/cached.png)\n![](assets/cached.png)';
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			existing
		);
		expect( uploadCalls ).toHaveLength( 0 );
		expect( result.cache ).toEqual( existing );
		expect( result.body ).toBe(
			'![](https://wp/uploads/cached.png)\n![](https://wp/uploads/cached.png)'
		);
	} );

	it( 'records errors for missing-on-disk assets and skips them', async () => {
		const body = '![alt](assets/missing.png)\n![ok](assets/exists.png)';
		writeAsset( 'exists.png' );
		uploadResponses = [
			{ ok: true, id: 9, url: 'https://wp/uploads/exists.png' },
		];
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			{}
		);
		expect( result.errors ).toHaveLength( 1 );
		expect( result.errors[ 0 ].url ).toBe( 'assets/missing.png' );
		expect( result.errors[ 0 ].reason ).toBe( 'not-found' );
		// Rewritten body: missing one keeps its original URL, the
		// existing one swaps to the source_url.
		expect( result.body ).toBe(
			'![alt](assets/missing.png)\n![ok](https://wp/uploads/exists.png)'
		);
	} );

	it( 'refuses path-traversal attempts', async () => {
		// Even if the user crafted a draft pointing at an absolute path,
		// resolveImagePath must keep them inside the project root.
		fs.writeFileSync( path.join( os.tmpdir(), 'escape.png' ), 'x' );
		const traversal = path.relative(
			path.join( projectDir, 'drafts' ),
			path.join( os.tmpdir(), 'escape.png' )
		);
		const body = `![](${ traversal })`;
		const result = await uploadAndRewriteImages(
			connection,
			body,
			projectDir,
			'drafts',
			{}
		);
		expect( result.errors[ 0 ].reason ).toBe( 'not-found' );
		expect( uploadCalls ).toHaveLength( 0 );
	} );
} );
