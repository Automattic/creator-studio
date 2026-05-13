import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const ALLOWED_ROOTS = [ 'drafts', 'sources', 'done' ] as const;

export type ProjectCreateFolderResult =
	| { ok: true; relPath: string }
	| {
			ok: false;
			reason: 'not-found' | 'invalid-name' | 'collision' | 'io-error';
	  };

const INVALID_NAME = /[\\/]|^\.|[\x00-\x1f]/;

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

function topSegment( relPath: string ): string {
	const norm = relPath.replace( /\\/g, '/' ).replace( /^\/+/, '' );
	const slash = norm.indexOf( '/' );
	return slash === -1 ? norm : norm.slice( 0, slash );
}

export const projectCreateFolder = defineChannel( {
	name: IpcChannels.projectCreateFolder,
	input: z.object( {
		projectId: z.string().min( 1 ),
		parentSubPath: z.string().min( 1 ),
		name: z.string().min( 1 ),
	} ),
	handle: ( {
		projectId,
		parentSubPath,
		name,
	} ): ProjectCreateFolderResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const trimmed = name.trim();
		if ( ! trimmed || INVALID_NAME.test( trimmed ) ) {
			return { ok: false, reason: 'invalid-name' };
		}
		const top = topSegment( parentSubPath );
		if (
			! ALLOWED_ROOTS.includes(
				top as ( typeof ALLOWED_ROOTS )[ number ]
			)
		) {
			return { ok: false, reason: 'invalid-name' };
		}
		const parent = resolveInside( project.path, parentSubPath );
		if ( ! parent ) {
			return { ok: false, reason: 'invalid-name' };
		}
		const target = resolveInside(
			project.path,
			path.join( parentSubPath, trimmed )
		);
		// Defense-in-depth: ensure the resolved target sits inside the
		// validated parent. Without this a name like `..` would slip through
		// the regex (it has no slash) and resolve outside the parent.
		if (
			! target ||
			( target !== parent && ! target.startsWith( parent + path.sep ) )
		) {
			return { ok: false, reason: 'invalid-name' };
		}
		try {
			fs.mkdirSync( parent, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		if ( fs.existsSync( target ) ) {
			return { ok: false, reason: 'collision' };
		}
		try {
			fs.mkdirSync( target );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		return {
			ok: true,
			relPath: path.relative( project.path, target ),
		};
	},
} );
