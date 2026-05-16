import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type {
	WordpressConnection,
	WordpressConnectionPublic,
} from '../../../types';

type StoreFile = { connections: WordpressConnection[] };

const PLAIN_PREFIX = 'plain:';

export function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'wordpress-connections.json' );
}

export function readStore(): StoreFile {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { connections: [] };
	}
	try {
		const parsed = JSON.parse(
			fs.readFileSync( file, 'utf-8' )
		) as StoreFile;
		if ( ! Array.isArray( parsed.connections ) ) {
			return { connections: [] };
		}
		return parsed;
	} catch {
		return { connections: [] };
	}
}

export function writeStore( data: StoreFile ): void {
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}

// Encrypts via Electron safeStorage when available (Keychain on macOS,
// DPAPI on Windows, libsecret on Linux). Falls back to a `plain:` prefix
// so we can detect plaintext secrets later — typically only hit when
// running headless on Linux without libsecret.
export function encryptSecret( raw: string ): string {
	if ( safeStorage.isEncryptionAvailable() ) {
		return safeStorage.encryptString( raw ).toString( 'base64' );
	}
	return `${ PLAIN_PREFIX }${ raw }`;
}

export function decryptSecret( cipher: string ): string {
	if ( cipher.startsWith( PLAIN_PREFIX ) ) {
		return cipher.slice( PLAIN_PREFIX.length );
	}
	return safeStorage.decryptString( Buffer.from( cipher, 'base64' ) );
}

export function toPublic(
	connection: WordpressConnection
): WordpressConnectionPublic {
	return {
		id: connection.id,
		label: connection.label,
		siteUrl: connection.siteUrl,
		kind: connection.kind,
		username: connection.username,
		wpcomBlogId: connection.wpcomBlogId,
		createdAt: connection.createdAt,
	};
}

export function listConnections(): WordpressConnectionPublic[] {
	return readStore().connections.map( toPublic );
}

export function getConnection( id: string ): WordpressConnection | undefined {
	return readStore().connections.find( ( c ) => c.id === id );
}

export function addConnection( connection: WordpressConnection ): void {
	const store = readStore();
	store.connections.push( connection );
	writeStore( store );
}

// Insert-or-replace by `id`. Used by the connect handlers when they
// already located an existing record (same wpcomBlogId, or same
// siteUrl+username for app passwords) and want to refresh its
// credential without breaking the id-based linkage that drafts'
// `wp_connection_id` frontmatter relies on.
export function upsertConnection( connection: WordpressConnection ): void {
	const store = readStore();
	const idx = store.connections.findIndex( ( c ) => c.id === connection.id );
	if ( idx >= 0 ) {
		store.connections[ idx ] = connection;
	} else {
		store.connections.push( connection );
	}
	writeStore( store );
}

// Lookup helpers used by the connect handlers to dedup.
// `findByWpcomBlogId` is the canonical key for a WordPress.com site —
// a single OAuth token can grant access to many blogs so we identify
// each by its numeric blog id rather than label/url. App-password
// connections are keyed by siteUrl+username because the same site can
// be connected once per WordPress user.
export function findByWpcomBlogId(
	blogId: number
): WordpressConnection | undefined {
	return readStore().connections.find(
		( c ) => c.kind === 'wpcom-oauth' && c.wpcomBlogId === blogId
	);
}

export function findAppPasswordConnection(
	siteUrl: string,
	username: string
): WordpressConnection | undefined {
	return readStore().connections.find(
		( c ) =>
			c.kind === 'app-password' &&
			c.siteUrl === siteUrl &&
			c.username === username
	);
}

export function removeConnection( id: string ): boolean {
	const store = readStore();
	const next = store.connections.filter( ( c ) => c.id !== id );
	if ( next.length === store.connections.length ) {
		return false;
	}
	writeStore( { connections: next } );
	return true;
}
