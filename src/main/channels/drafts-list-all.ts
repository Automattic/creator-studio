import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { parseDraft } from './utils/parse-draft';
import { listProjects } from './utils/projects-list';
import { IpcChannels } from '.';
import type { Draft } from '../../types';

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

export const draftsListAll = defineChannel( {
	name: IpcChannels.draftsListAll,
	input: z.void(),
	handle: (): Draft[] => {
		const out: Draft[] = [];
		for ( const project of listProjects() ) {
			const dir = resolveInside( project.path, DRAFTS_FOLDER );
			if ( ! dir ) {
				continue;
			}
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync( dir, { withFileTypes: true } );
			} catch {
				// missing folder = no drafts in this project; silently skip.
				continue;
			}
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
		}
		out.sort( ( a, b ) => b.mtime - a.mtime );
		return out;
	},
} );
