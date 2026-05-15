import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';
import type { DraftCheckMeta } from '../../types';

const CHECKS_FOLDER = 'checks';
const MAX_BYTES = 5_000_000;

function isMarkdown( name: string ): boolean {
	return name.toLowerCase().endsWith( '.md' );
}

export const checksList = defineChannel( {
	name: IpcChannels.checksList,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ): DraftCheckMeta[] => {
		const project = getProject( projectId );
		if ( ! project ) {
			return [];
		}
		const dir = path.resolve( project.path, CHECKS_FOLDER );
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync( dir, { withFileTypes: true } );
		} catch {
			return [];
		}
		const out: DraftCheckMeta[] = [];
		for ( const entry of entries ) {
			if ( ! entry.isFile() ) {
				continue;
			}
			if ( entry.name.startsWith( '.' ) ) {
				continue;
			}
			if ( ! isMarkdown( entry.name ) ) {
				continue;
			}
			const target = path.join( dir, entry.name );
			let stat: fs.Stats;
			try {
				stat = fs.statSync( target );
			} catch {
				continue;
			}
			if ( stat.size > MAX_BYTES ) {
				out.push( {
					relPath: entry.name,
					title: entry.name.replace( /\.md$/i, '' ),
					enabled: false,
					mtime: stat.mtimeMs,
					parseError: 'file-too-large',
				} );
				continue;
			}
			let raw: string;
			try {
				raw = fs.readFileSync( target, 'utf-8' );
			} catch {
				continue;
			}
			let title = entry.name.replace( /\.md$/i, '' );
			let enabled = false;
			let parseError: string | null = null;
			try {
				const parsed = matter( raw );
				const data = parsed.data as Record< string, unknown >;
				const t = data.title;
				if ( typeof t === 'string' && t.trim().length > 0 ) {
					title = t;
				}
				enabled = data.enabled === true;
			} catch {
				parseError = 'yaml-syntax';
			}
			out.push( {
				relPath: entry.name,
				title,
				enabled,
				mtime: stat.mtimeMs,
				parseError,
			} );
		}
		out.sort( ( a, b ) =>
			a.title.localeCompare( b.title, undefined, { sensitivity: 'base' } )
		);
		return out;
	},
} );
