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

export function removeConnection( id: string ): boolean {
	const store = readStore();
	const next = store.connections.filter( ( c ) => c.id !== id );
	if ( next.length === store.connections.length ) {
		return false;
	}
	writeStore( { connections: next } );
	return true;
}
