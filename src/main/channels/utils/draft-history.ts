import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { getProject } from './project-get';

function isInside( root: string, target: string ): boolean {
	return target === root || target.startsWith( root + path.sep );
}

export type SnapshotSource = 'agent' | 'manual' | 'idle' | 'pre-restore';

export type DraftSnapshotMeta = {
	id: string;
	takenAt: number;
	source: SnapshotSource;
};

export type DraftSnapshot = DraftSnapshotMeta & {
	title: string;
	body: string;
	frontmatter: Record< string, unknown >;
};

type DraftFolder = 'drafts' | 'done' | 'sources' | 'checks';

function resolveDraftFile(
	root: string,
	folder: DraftFolder,
	relPath: string
): string | null {
	const folderRoot = path.resolve( root, folder );
	const target = path.resolve( folderRoot, relPath );
	if (
		target !== folderRoot &&
		! target.startsWith( folderRoot + path.sep )
	) {
		return null;
	}
	return target;
}

// One directory per draft, sibling to the draft's path under .studio-write/.
// The `.d` suffix avoids confusion with the source file (e.g. foo.md.d/ vs foo.md).
function historyDir(
	root: string,
	folder: DraftFolder,
	relPath: string
): string {
	return path.join(
		root,
		'.studio-write',
		'history',
		folder,
		`${ relPath }.d`
	);
}

function readDraftFromDisk( file: string ): {
	title: string;
	body: string;
	frontmatter: Record< string, unknown >;
} | null {
	let raw: string;
	try {
		raw = fs.readFileSync( file, 'utf-8' );
	} catch {
		return null;
	}
	const parsed = matter( raw );
	const data = ( parsed.data ?? {} ) as Record< string, unknown >;
	const title = typeof data.title === 'string' ? data.title : '';
	const frontmatter = { ...data };
	delete frontmatter.title;
	return { title, body: parsed.content, frontmatter };
}

// Filename shape: <iso>-<source>.json. ISO timestamps sort lexicographically,
// so a directory listing in reverse order is already newest-first. The `:`
// in the ISO format is filesystem-hostile on Windows; we replace with `-`.
function snapshotFilename( takenAt: number, source: SnapshotSource ): string {
	const iso = new Date( takenAt ).toISOString().replace( /:/g, '-' );
	return `${ iso }-${ source }.json`;
}

function parseSnapshotFilename(
	name: string
): { takenAt: number; source: SnapshotSource } | null {
	const match = name.match(
		/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-(agent|manual|idle|pre-restore)\.json$/
	);
	if ( ! match ) {
		return null;
	}
	const isoRestored = match[ 1 ].replace(
		/T(\d{2})-(\d{2})-(\d{2})/,
		'T$1:$2:$3'
	);
	const takenAt = Date.parse( isoRestored );
	if ( Number.isNaN( takenAt ) ) {
		return null;
	}
	return { takenAt, source: match[ 2 ] as SnapshotSource };
}

export function listSnapshots(
	projectId: string,
	folder: DraftFolder,
	relPath: string
): DraftSnapshotMeta[] {
	const project = getProject( projectId );
	if ( ! project ) {
		return [];
	}
	const dir = historyDir( project.path, folder, relPath );
	let entries: string[];
	try {
		entries = fs.readdirSync( dir );
	} catch {
		return [];
	}
	const out: DraftSnapshotMeta[] = [];
	for ( const name of entries ) {
		const parsed = parseSnapshotFilename( name );
		if ( ! parsed ) {
			continue;
		}
		out.push( {
			id: name,
			takenAt: parsed.takenAt,
			source: parsed.source,
		} );
	}
	out.sort( ( a, b ) => b.takenAt - a.takenAt );
	return out;
}

export type TakeSnapshotResult =
	| { ok: true; snapshot: DraftSnapshotMeta }
	| { ok: false; reason: 'not-found' | 'io-error' };

export function takeSnapshot(
	projectId: string,
	folder: DraftFolder,
	relPath: string,
	source: SnapshotSource
): TakeSnapshotResult {
	const project = getProject( projectId );
	if ( ! project ) {
		return { ok: false, reason: 'not-found' };
	}
	const target = resolveDraftFile( project.path, folder, relPath );
	if ( ! target ) {
		return { ok: false, reason: 'not-found' };
	}
	const parsed = readDraftFromDisk( target );
	if ( ! parsed ) {
		return { ok: false, reason: 'not-found' };
	}
	const takenAt = Date.now();
	const filename = snapshotFilename( takenAt, source );
	const dir = historyDir( project.path, folder, relPath );
	const file = path.join( dir, filename );
	const payload: DraftSnapshot = {
		id: filename,
		takenAt,
		source,
		title: parsed.title,
		body: parsed.body,
		frontmatter: parsed.frontmatter,
	};
	try {
		fs.mkdirSync( dir, { recursive: true } );
		fs.writeFileSync( file, JSON.stringify( payload, null, 2 ), 'utf-8' );
	} catch {
		return { ok: false, reason: 'io-error' };
	}
	return {
		ok: true,
		snapshot: { id: filename, takenAt, source },
	};
}

export type ReadSnapshotResult =
	| { ok: true; snapshot: DraftSnapshot }
	| { ok: false; reason: 'not-found' | 'io-error' };

export function readSnapshot(
	projectId: string,
	folder: DraftFolder,
	relPath: string,
	id: string
): ReadSnapshotResult {
	const project = getProject( projectId );
	if ( ! project ) {
		return { ok: false, reason: 'not-found' };
	}
	// Snapshot ids are filenames produced by `snapshotFilename`. Refuse any id
	// that escapes the snapshot directory so a poisoned id can't read project
	// files via `..`.
	if ( ! parseSnapshotFilename( id ) ) {
		return { ok: false, reason: 'not-found' };
	}
	const dir = historyDir( project.path, folder, relPath );
	const file = path.resolve( dir, id );
	if ( ! isInside( path.resolve( dir ), file ) ) {
		return { ok: false, reason: 'not-found' };
	}
	let raw: string;
	try {
		raw = fs.readFileSync( file, 'utf-8' );
	} catch {
		return { ok: false, reason: 'not-found' };
	}
	try {
		const parsed = JSON.parse( raw ) as DraftSnapshot;
		return { ok: true, snapshot: parsed };
	} catch {
		return { ok: false, reason: 'io-error' };
	}
}

export type RestoreSnapshotResult =
	| {
			ok: true;
			restoredFrom: string;
			preRestore: DraftSnapshotMeta;
			mtime: number;
	  }
	| { ok: false; reason: 'not-found' | 'io-error' };

export function restoreSnapshot(
	projectId: string,
	folder: DraftFolder,
	relPath: string,
	id: string
): RestoreSnapshotResult {
	const project = getProject( projectId );
	if ( ! project ) {
		return { ok: false, reason: 'not-found' };
	}
	const target = resolveDraftFile( project.path, folder, relPath );
	if ( ! target ) {
		return { ok: false, reason: 'not-found' };
	}
	// Safety net: capture the current state before we overwrite. If this fails
	// we refuse the restore so the user never loses work silently.
	const pre = takeSnapshot( projectId, folder, relPath, 'pre-restore' );
	if ( pre.ok === false ) {
		return { ok: false, reason: pre.reason };
	}
	const snap = readSnapshot( projectId, folder, relPath, id );
	if ( snap.ok === false ) {
		return { ok: false, reason: snap.reason };
	}
	const data = { ...snap.snapshot.frontmatter, title: snap.snapshot.title };
	const assembled = matter.stringify( snap.snapshot.body, data );
	try {
		fs.mkdirSync( path.dirname( target ), { recursive: true } );
		fs.writeFileSync( target, assembled, 'utf-8' );
		const stat = fs.statSync( target );
		return {
			ok: true,
			restoredFrom: id,
			preRestore: pre.snapshot,
			mtime: stat.mtimeMs,
		};
	} catch {
		return { ok: false, reason: 'io-error' };
	}
}
