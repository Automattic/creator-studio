import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real safeStorage isn't available outside Electron's main runtime.
// We stub it with a deterministic xor-style "encryption" so the cipher
// is non-trivially different from the plaintext (proves we actually
// invoked encrypt) but easy to assert on.
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

import {
	addConnection,
	decryptSecret,
	encryptSecret,
	findAppPasswordConnection,
	findByWpcomBlogId,
	getConnection,
	listConnections,
	removeConnection,
	storePath,
	toPublic,
	upsertConnection,
} from '../../src/main/channels/utils/wordpress-store';
import type { WordpressConnection } from '../../src/types';

beforeEach( () => {
	mockUserData.dir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-store-' ) );
} );

afterEach( () => {
	try {
		fs.rmSync( mockUserData.dir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

function sampleConnection(
	overrides: Partial< WordpressConnection > = {}
): WordpressConnection {
	return {
		id: 'conn-1',
		label: 'Test Blog',
		siteUrl: 'https://example.com',
		kind: 'app-password',
		username: 'admin',
		secretCipher: encryptSecret( 'super-secret' ),
		createdAt: 1700000000000,
		...overrides,
	};
}

describe( 'wordpress-store: encrypt/decrypt', () => {
	it( 'round-trips a secret via safeStorage', () => {
		const cipher = encryptSecret( 'hello' );
		expect( cipher.startsWith( 'plain:' ) ).toBe( false );
		expect( cipher ).not.toBe( 'hello' );
		expect( decryptSecret( cipher ) ).toBe( 'hello' );
	} );

	it( 'transparently handles legacy plain: prefixed secrets', () => {
		expect( decryptSecret( 'plain:legacy' ) ).toBe( 'legacy' );
	} );
} );

describe( 'wordpress-store: CRUD', () => {
	it( 'starts empty and returns [] from listConnections', () => {
		expect( listConnections() ).toEqual( [] );
		expect( fs.existsSync( storePath() ) ).toBe( false );
	} );

	it( 'persists addConnection to disk and reads it back', () => {
		addConnection( sampleConnection() );
		const list = listConnections();
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].id ).toBe( 'conn-1' );
		expect( list[ 0 ].label ).toBe( 'Test Blog' );
		expect( fs.existsSync( storePath() ) ).toBe( true );
	} );

	it( 'toPublic strips secretCipher', () => {
		const conn = sampleConnection();
		const pub = toPublic( conn );
		expect( pub ).not.toHaveProperty( 'secretCipher' );
		// Username is preserved in the public projection because it
		// shows up in the connection row (and isn't a secret on its
		// own — the app password is).
		expect( pub.username ).toBe( 'admin' );
	} );

	it( 'listConnections never exposes secretCipher to callers', () => {
		addConnection( sampleConnection() );
		const list = listConnections();
		for ( const entry of list ) {
			expect( entry ).not.toHaveProperty( 'secretCipher' );
		}
	} );

	it( 'getConnection returns the full record including the cipher', () => {
		addConnection( sampleConnection() );
		const conn = getConnection( 'conn-1' );
		expect( conn ).not.toBeUndefined();
		expect( conn?.secretCipher ).not.toBe( 'super-secret' );
		expect( decryptSecret( conn!.secretCipher ) ).toBe( 'super-secret' );
	} );

	it( 'getConnection returns undefined for unknown ids', () => {
		addConnection( sampleConnection() );
		expect( getConnection( 'nope' ) ).toBeUndefined();
	} );

	it( 'removeConnection drops the record and returns true', () => {
		addConnection( sampleConnection() );
		expect( removeConnection( 'conn-1' ) ).toBe( true );
		expect( listConnections() ).toEqual( [] );
	} );

	it( 'removeConnection returns false when nothing matches', () => {
		expect( removeConnection( 'nope' ) ).toBe( false );
	} );

	it( 'survives a malformed JSON file by returning empty', () => {
		fs.mkdirSync( path.dirname( storePath() ), { recursive: true } );
		fs.writeFileSync( storePath(), '{ not json', 'utf-8' );
		expect( listConnections() ).toEqual( [] );
	} );

	it( 'findByWpcomBlogId locates an existing WP.com record', () => {
		addConnection(
			sampleConnection( {
				id: 'wpcom-a',
				kind: 'wpcom-oauth',
				wpcomBlogId: 999,
			} )
		);
		expect( findByWpcomBlogId( 999 )?.id ).toBe( 'wpcom-a' );
		expect( findByWpcomBlogId( 0 ) ).toBeUndefined();
		expect( findByWpcomBlogId( 12345 ) ).toBeUndefined();
	} );

	it( 'findAppPasswordConnection matches on siteUrl + username', () => {
		addConnection(
			sampleConnection( {
				id: 'app-a',
				siteUrl: 'https://blog.example',
				username: 'admin',
			} )
		);
		expect(
			findAppPasswordConnection( 'https://blog.example', 'admin' )?.id
		).toBe( 'app-a' );
		// Different username on the same site is a different connection.
		expect(
			findAppPasswordConnection( 'https://blog.example', 'editor' )
		).toBeUndefined();
		// Different siteUrl is a different connection.
		expect(
			findAppPasswordConnection( 'https://other.example', 'admin' )
		).toBeUndefined();
	} );

	it( 'upsertConnection replaces an existing record by id and preserves linkage', () => {
		addConnection( sampleConnection( { id: 'keep-me', label: 'Old' } ) );
		// Re-upsert with the same id but a fresh label / new secret —
		// simulates a refresh after re-auth. The record updates in
		// place rather than spawning a duplicate.
		upsertConnection(
			sampleConnection( {
				id: 'keep-me',
				label: 'New label',
				secretCipher: encryptSecret( 'rotated' ),
			} )
		);
		const list = listConnections();
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].label ).toBe( 'New label' );
		expect(
			decryptSecret( getConnection( 'keep-me' )!.secretCipher )
		).toBe( 'rotated' );
	} );

	it( 'handles two connections independently', () => {
		addConnection( sampleConnection( { id: 'c1', label: 'A' } ) );
		addConnection(
			sampleConnection( {
				id: 'c2',
				label: 'B',
				kind: 'wpcom-oauth',
				wpcomBlogId: 12345,
				secretCipher: encryptSecret( 'oauth-token' ),
			} )
		);
		const list = listConnections();
		expect( list.map( ( c ) => c.id ).sort() ).toEqual( [ 'c1', 'c2' ] );
		expect( list.find( ( c ) => c.id === 'c2' )?.wpcomBlogId ).toBe(
			12345
		);
		// Remove one — the other survives.
		removeConnection( 'c1' );
		expect( listConnections().map( ( c ) => c.id ) ).toEqual( [ 'c2' ] );
	} );
} );
