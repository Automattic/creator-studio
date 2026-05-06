import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';
const DEFAULT_TITLE = 'Untitled';
const BASENAME = 'untitled';

export type DraftCreateResult =
	| { ok: true; relPath: string; title: string }
	| { ok: false; reason: 'not-found' | 'io-error' };

// Walk `untitled.md`, `untitled-2.md`, … until we find a name that doesn't
// exist on disk. We stop at 1000 to avoid an unbounded loop if something
// pathological is happening; in practice the user will run out of patience
// long before we run out of slots.
function pickAvailableName( draftsDir: string ): string | null {
	for ( let i = 1; i <= 1000; i++ ) {
		const name = i === 1 ? `${ BASENAME }.md` : `${ BASENAME }-${ i }.md`;
		if ( ! fs.existsSync( path.join( draftsDir, name ) ) ) {
			return name;
		}
	}
	return null;
}

export const draftsCreate = defineChannel( {
	name: IpcChannels.draftsCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ): DraftCreateResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const draftsDir = path.resolve( project.path, DRAFTS_FOLDER );
		try {
			fs.mkdirSync( draftsDir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const name = pickAvailableName( draftsDir );
		if ( ! name ) {
			return { ok: false, reason: 'io-error' };
		}
		const target = path.join( draftsDir, name );
		const contents = matter.stringify( '', {
			title: DEFAULT_TITLE,
			autoSlug: true,
		} );
		try {
			fs.writeFileSync( target, contents, {
				encoding: 'utf-8',
				flag: 'wx',
			} );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		return { ok: true, relPath: name, title: DEFAULT_TITLE };
	},
} );
