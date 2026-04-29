import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

// Bound to keep the renderer from inhaling a 50 MB log via the preview path.
// Drafts are markdown — anything substantially larger isn't a "preview" use
// case anymore.
const MAX_BYTES = 1_000_000;

// Same in-bounds check as project-list-files.ts: resolve, then verify the
// target sits at or under the project root by string comparison. Prevents
// `..` escapes; for a stricter realpath check we'd need an actual file on
// disk, but the renderer never lists symlinked paths and the agent SDK has
// its own deny patterns for `.studio-write/`.
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

export type ReadFileResult = {
	text: string;
	mtime: number | null;
} | null;

export const projectReadFile = defineChannel( {
	name: IpcChannels.projectReadFile,
	input: z.object( {
		projectId: z.string().min( 1 ),
		subPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, subPath } ): ReadFileResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const target = resolveInside( project.path, subPath );
		if ( ! target ) {
			return null;
		}
		let stat: fs.Stats;
		try {
			stat = fs.statSync( target );
		} catch {
			return null;
		}
		if ( ! stat.isFile() ) {
			return null;
		}
		if ( stat.size > MAX_BYTES ) {
			return {
				text: '',
				mtime: stat.mtimeMs,
			};
		}
		try {
			const text = fs.readFileSync( target, 'utf-8' );
			return { text, mtime: stat.mtimeMs };
		} catch {
			return null;
		}
	},
} );
