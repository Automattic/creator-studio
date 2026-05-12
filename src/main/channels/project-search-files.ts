import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readMarkdownMeta } from './utils/markdown-preview';
import { getProject } from './utils/project-get';
import { thumbHash, thumbPaths, thumbStatus } from './utils/thumbnails';
import { IpcChannels } from '.';
import type { SearchHit } from '../../types';

const VIDEO_EXTENSIONS = [ '.mp4', '.m4v', '.webm', '.mov', '.ogv' ];

function isThumbnailable( name: string ): boolean {
	const lower = name.toLowerCase();
	if ( lower.endsWith( '.pdf' ) ) {
		return true;
	}
	return VIDEO_EXTENSIONS.some( ( ext ) => lower.endsWith( ext ) );
}

// Walk caps so a misconfigured giant folder can't stall the renderer.
const MAX_RESULTS = 200;
const MAX_ENTRIES = 5000;

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

export const projectSearchFiles = defineChannel( {
	name: IpcChannels.projectSearchFiles,
	input: z.object( {
		projectId: z.string().min( 1 ),
		query: z.string(),
		folders: z.array( z.string().min( 1 ) ).min( 1 ),
	} ),
	handle: ( { projectId, query, folders } ): SearchHit[] => {
		const project = getProject( projectId );
		if ( ! project ) {
			return [];
		}
		const needle = query.trim().toLowerCase();
		if ( needle.length === 0 ) {
			return [];
		}
		const hits: SearchHit[] = [];
		let visited = 0;

		for ( const folder of folders ) {
			const root = resolveInside( project.path, folder );
			if ( ! root ) {
				continue;
			}
			const stack: string[] = [ '' ];
			while ( stack.length > 0 ) {
				if ( hits.length >= MAX_RESULTS || visited >= MAX_ENTRIES ) {
					break;
				}
				const rel = stack.pop() as string;
				const dir = rel === '' ? root : path.join( root, rel );
				let entries: fs.Dirent[];
				try {
					entries = fs.readdirSync( dir, { withFileTypes: true } );
				} catch {
					continue;
				}
				for ( const entry of entries ) {
					if ( entry.name.startsWith( '.' ) ) {
						continue;
					}
					visited += 1;
					if ( visited > MAX_ENTRIES ) {
						break;
					}
					const childRel =
						rel === '' ? entry.name : `${ rel }/${ entry.name }`;
					if ( entry.name.toLowerCase().includes( needle ) ) {
						const entryPath = path.join( dir, entry.name );
						let mtime: number | undefined;
						try {
							mtime = fs.statSync( entryPath ).mtimeMs;
						} catch {
							mtime = undefined;
						}
						const excerpt = entry.isDirectory()
							? null
							: readMarkdownMeta( entryPath ).excerpt;
						let thumbPathRel: string | undefined;
						if (
							! entry.isDirectory() &&
							isThumbnailable( entry.name ) &&
							mtime !== undefined
						) {
							const hash = thumbHash(
								`${ folder }/${ childRel }`,
								mtime
							);
							if (
								thumbStatus( project.path, hash ) === 'ready'
							) {
								thumbPathRel = thumbPaths(
									project.path,
									hash
								).pngRel;
							}
						}
						hits.push( {
							folder,
							relPath: childRel,
							name: entry.name,
							isDirectory: entry.isDirectory(),
							mtime,
							excerpt: excerpt ?? undefined,
							thumbPath: thumbPathRel,
						} );
						if ( hits.length >= MAX_RESULTS ) {
							break;
						}
					}
					if ( entry.isDirectory() ) {
						stack.push( childRel );
					}
				}
			}
		}
		hits.sort( ( a, b ) => {
			if ( a.folder !== b.folder ) {
				return (
					folders.indexOf( a.folder ) - folders.indexOf( b.folder )
				);
			}
			return a.relPath.localeCompare( b.relPath );
		} );
		return hits;
	},
} );
