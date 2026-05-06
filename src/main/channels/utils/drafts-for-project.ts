import fs from 'node:fs';
import path from 'node:path';

import { parseDraft } from './parse-draft';
import type { Draft, Project } from '../../../types';

const DRAFTS_FOLDER = 'drafts';

// Mirrors the safety check in `project-list-files.ts` even though `subPath`
// is hard-coded — keeps the story uniform if the scope ever widens.
function resolveInside( root: string, subPath: string ): string | null {
	const target = path.resolve( root, subPath );
	const rootResolved = path.resolve( root );
	if (
		target !== rootResolved &&
		! target.startsWith( rootResolved + path.sep )
	) {
		return null;
	}
	return target;
}

// Enumerates the .md files in `<project>/drafts/`, parsing frontmatter for
// each. Returns a `Draft[]` sorted newest first. Used by both the global
// (`drafts:listAll`) and per-project (`drafts:listProject`) channels so the
// two views stay shape-compatible.
export function draftsForProject( project: Project ): Draft[] {
	const dir = resolveInside( project.path, DRAFTS_FOLDER );
	if ( ! dir ) {
		return [];
	}
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync( dir, { withFileTypes: true } );
	} catch {
		return [];
	}
	const out: Draft[] = [];
	for ( const entry of entries ) {
		if ( entry.isDirectory() ) {
			continue;
		}
		if ( entry.name.startsWith( '.' ) ) {
			continue;
		}
		if ( ! entry.name.toLowerCase().endsWith( '.md' ) ) {
			continue;
		}
		try {
			const filePath = path.join( dir, entry.name );
			const stat = fs.statSync( filePath );
			const raw = fs.readFileSync( filePath, 'utf-8' );
			const parsed = parseDraft( raw, entry.name );
			out.push( {
				projectId: project.id,
				projectName: project.name,
				relPath: entry.name,
				title: parsed.title,
				description: parsed.description,
				wordCount: parsed.wordCount,
				mtime: stat.mtimeMs,
			} );
		} catch {
			// One bad file shouldn't blank the whole feed; skip it.
		}
	}
	out.sort( ( a, b ) => b.mtime - a.mtime );
	return out;
}
