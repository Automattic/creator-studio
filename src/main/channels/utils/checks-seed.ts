import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { resolveBundledChecksDefaultsDir } from './resource-paths';
import { slugifyTitle } from './slugify';

const CHECKS_FOLDER = 'checks';

function readTitle( filePath: string ): string | null {
	try {
		const raw = fs.readFileSync( filePath, 'utf-8' );
		const parsed = matter( raw );
		const t = ( parsed.data as Record< string, unknown > ).title;
		if ( typeof t === 'string' && t.trim().length > 0 ) {
			return t.trim();
		}
	} catch {
		// Unreadable or malformed frontmatter — treat as "no title".
	}
	return null;
}

// Build a dedupe slug: lowercase, hyphen-normalized, with the trailing
// `-2`/`-3`/... disambiguator stripped so `elements-of-style-2.md` still
// matches the bundled "Elements of Style". `checks-create` appends that
// disambiguator when a name is taken, so it shows up on stale duplicates too.
function dedupeSlug( s: string ): string | null {
	const stripped = s.replace( /\.md$/i, '' );
	const slug = slugifyTitle( stripped );
	if ( ! slug ) {
		return null;
	}
	return slug.replace( /-\d+$/, '' );
}

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
	const bundled: Array< { name: string; title: string | null } > = [];
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
		bundled.push( {
			name: entry.name,
			title: readTitle( path.join( defaultsDir, entry.name ) ),
		} );
	}
	const bundledNames = new Set( bundled.map( ( b ) => b.name ) );
	// Slug-space match against both bundled filenames and bundled titles, so
	// renamed copies (e.g. `amazon-writing-2.md` for `bezos.md`) and stub files
	// whose only frontmatter title is the filename slug both get folded back
	// into the canonical bundled name on reset.
	const bundledSlugs = new Set< string >();
	for ( const b of bundled ) {
		const nameSlug = dedupeSlug( b.name );
		if ( nameSlug ) {
			bundledSlugs.add( nameSlug );
		}
		if ( b.title ) {
			const titleSlug = dedupeSlug( b.title );
			if ( titleSlug ) {
				bundledSlugs.add( titleSlug );
			}
		}
	}
	let existing: fs.Dirent[] = [];
	try {
		existing = fs.readdirSync( dir, { withFileTypes: true } );
	} catch {
		// Just-created dir; nothing to clean.
	}
	for ( const entry of existing ) {
		if ( ! entry.isFile() ) {
			continue;
		}
		if ( entry.name.startsWith( '.' ) ) {
			continue;
		}
		if ( ! entry.name.toLowerCase().endsWith( '.md' ) ) {
			continue;
		}
		if ( bundledNames.has( entry.name ) ) {
			continue;
		}
		const candidates: string[] = [];
		const nameSlug = dedupeSlug( entry.name );
		if ( nameSlug ) {
			candidates.push( nameSlug );
		}
		const title = readTitle( path.join( dir, entry.name ) );
		if ( title ) {
			const titleSlug = dedupeSlug( title );
			if ( titleSlug ) {
				candidates.push( titleSlug );
			}
		}
		if ( candidates.some( ( c ) => bundledSlugs.has( c ) ) ) {
			try {
				fs.unlinkSync( path.join( dir, entry.name ) );
			} catch {
				// Best-effort cleanup; if it fails the user can delete the
				// stray file by hand.
			}
		}
	}
	const written: string[] = [];
	for ( const b of bundled ) {
		const src = path.join( defaultsDir, b.name );
		const dest = path.join( dir, b.name );
		try {
			const contents = fs.readFileSync( src );
			fs.writeFileSync( dest, contents );
			written.push( b.name );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	}
	return { ok: true, written };
}
