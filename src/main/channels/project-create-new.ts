import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readStore, writeStore } from './utils/project-store';
import { IpcChannels } from '.';
import type { Project, ProjectCreateNewResult } from '../../types';

const Input = z.object( {
	name: z.string().min( 1 ),
	goal: z.string().optional(),
	parentDir: z.string().min( 1 ).optional(),
} );

export function defaultParentDir(): string {
	return path.join( app.getPath( 'documents' ), 'Studio Write' );
}

// Convert a free-text project name into a filesystem-safe folder basename.
// Strips path separators and trims; falls back to "project" if everything
// got stripped so we never end up trying to mkdir an empty segment.
export function sanitizeFolderName( name: string ): string {
	const cleaned = name
		.trim()
		.replace( /[\\/]+/g, '-' )
		.replace( /\s+/g, ' ' )
		.replace( /^\.+/, '' );
	return cleaned.length > 0 ? cleaned : 'project';
}

export const projectCreateNew = defineChannel( {
	name: IpcChannels.projectCreateNew,
	input: Input,
	handle: ( input ): ProjectCreateNewResult => {
		const parent = input.parentDir ?? defaultParentDir();
		const folder = sanitizeFolderName( input.name );
		const targetPath = path.join( parent, folder );

		if ( fs.existsSync( targetPath ) ) {
			let entries: string[] = [];
			try {
				entries = fs.readdirSync( targetPath );
			} catch {
				entries = [ 'unreadable' ];
			}
			if ( entries.length > 0 ) {
				return { ok: false, reason: 'target-exists', targetPath };
			}
		}

		try {
			fs.mkdirSync( targetPath, { recursive: true } );
		} catch ( err ) {
			return {
				ok: false,
				reason: 'io-error',
				message: err instanceof Error ? err.message : String( err ),
			};
		}

		const store = readStore();
		const trimmedGoal = input.goal?.trim();
		const project: Project = {
			id: randomUUID(),
			path: targetPath,
			label: folder,
			name: input.name.trim(),
			goal:
				trimmedGoal && trimmedGoal.length > 0 ? trimmedGoal : undefined,
		};
		store.projects.push( project );
		writeStore( store );
		return { ok: true, project };
	},
} );
