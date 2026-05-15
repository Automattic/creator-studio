import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const CHECKS_FOLDER = 'checks';
const DEFAULT_TITLE = 'Untitled check';
const BASENAME = 'untitled-check';

export type CheckCreateResult =
	| { ok: true; relPath: string; title: string }
	| { ok: false; reason: 'not-found' | 'io-error' };

function pickAvailableName( dir: string ): string | null {
	for ( let i = 1; i <= 1000; i++ ) {
		const name = i === 1 ? `${ BASENAME }.md` : `${ BASENAME }-${ i }.md`;
		if ( ! fs.existsSync( path.join( dir, name ) ) ) {
			return name;
		}
	}
	return null;
}

export const checksCreate = defineChannel( {
	name: IpcChannels.checksCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ): CheckCreateResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const dir = path.resolve( project.path, CHECKS_FOLDER );
		try {
			fs.mkdirSync( dir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const name = pickAvailableName( dir );
		if ( ! name ) {
			return { ok: false, reason: 'io-error' };
		}
		const target = path.join( dir, name );
		const contents = matter.stringify( '', {
			title: DEFAULT_TITLE,
			enabled: true,
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
