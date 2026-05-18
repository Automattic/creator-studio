import fs from 'node:fs';
import path from 'node:path';

import { resolveBundledChecksDefaultsDir } from './resource-paths';

const CHECKS_FOLDER = 'checks';

export type SeedDefaultChecksResult =
	| { ok: true; written: string[] }
	| { ok: false; reason: 'io-error' };

// Seed only when the project's checks/ folder doesn't already contain any
// markdown. Used by the link-existing-folder path so we don't clobber a
// user's pre-curated checks. A missing folder, an empty folder, or a folder
// with only non-markdown contents all count as "empty".
export function seedDefaultChecksIfEmpty(
	projectPath: string
): SeedDefaultChecksResult {
	const dir = path.resolve( projectPath, CHECKS_FOLDER );
	let entries: fs.Dirent[] = [];
	try {
		entries = fs.readdirSync( dir, { withFileTypes: true } );
	} catch {
		// Missing or unreadable — fall through to seed.
	}
	const hasMarkdown = entries.some(
		( e ) =>
			e.isFile() &&
			! e.name.startsWith( '.' ) &&
			e.name.toLowerCase().endsWith( '.md' )
	);
	if ( hasMarkdown ) {
		return { ok: true, written: [] };
	}
	return seedDefaultChecks( projectPath );
}

export function seedDefaultChecks(
	projectPath: string
): SeedDefaultChecksResult {
	let defaultsDir: string;
	try {
		defaultsDir = resolveBundledChecksDefaultsDir();
	} catch {
		return { ok: false, reason: 'io-error' };
	}
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync( defaultsDir, { withFileTypes: true } );
	} catch {
		return { ok: false, reason: 'io-error' };
	}
	const dir = path.resolve( projectPath, CHECKS_FOLDER );
	try {
		fs.mkdirSync( dir, { recursive: true } );
	} catch {
		return { ok: false, reason: 'io-error' };
	}
	const written: string[] = [];
	for ( const entry of entries ) {
		if ( ! entry.isFile() ) {
			continue;
		}
		if ( entry.name.startsWith( '.' ) ) {
			continue;
		}
		if ( ! entry.name.toLowerCase().endsWith( '.md' ) ) {
			continue;
		}
		const src = path.join( defaultsDir, entry.name );
		const dest = path.join( dir, entry.name );
		try {
			const contents = fs.readFileSync( src );
			fs.writeFileSync( dest, contents );
			written.push( entry.name );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	}
	return { ok: true, written };
}
