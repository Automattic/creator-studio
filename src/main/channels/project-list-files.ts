import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { summarizeFolder } from './utils/folder-summary';
import { readMarkdownExcerpt } from './utils/markdown-preview';
import { getProject } from './utils/project-get';
import { thumbHash, thumbPaths, thumbStatus } from './utils/thumbnails';
import { IpcChannels } from '.';
import type { DirEntry } from '../../types';

// Keep this list in sync with `previewKind.VIDEO_EXTENSIONS` on the renderer.
const VIDEO_EXTENSIONS = [ '.mp4', '.m4v', '.webm', '.mov', '.ogv' ];

function isThumbnailable( name: string ): boolean {
	const lower = name.toLowerCase();
	if ( lower.endsWith( '.pdf' ) ) {
		return true;
	}
	return VIDEO_EXTENSIONS.some( ( ext ) => lower.endsWith( ext ) );
}

// Resolve `subPath` relative to the project root and refuse anything that
// escapes it via `..` or symlinks. Returning `null` for out-of-bounds keeps
// the renderer from probing the wider filesystem through this channel.
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

export const projectListFiles = defineChannel( {
	name: IpcChannels.projectListFiles,
	input: z.object( {
		projectId: z.string().min( 1 ),
		subPath: z.string().default( '' ),
	} ),
	handle: ( { projectId, subPath } ): DirEntry[] => {
		const project = getProject( projectId );
		if ( ! project ) {
			return [];
		}
		const target = resolveInside( project.path, subPath );
		if ( ! target ) {
			return [];
		}
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync( target, { withFileTypes: true } );
		} catch {
			return [];
		}
		const mapped: DirEntry[] = entries
			.filter( ( e ) => ! e.name.startsWith( '.' ) )
			.map( ( e ) => {
				const entryPath = path.join( target, e.name );
				let mtime: number | undefined;
				try {
					mtime = fs.statSync( entryPath ).mtimeMs;
				} catch {
					mtime = undefined;
				}
				const excerpt = e.isDirectory()
					? null
					: readMarkdownExcerpt( entryPath );
				let thumbPathRel: string | undefined;
				if (
					! e.isDirectory() &&
					isThumbnailable( e.name ) &&
					mtime !== undefined
				) {
					const projectRelPath = subPath
						? `${ subPath }/${ e.name }`
						: e.name;
					const hash = thumbHash( projectRelPath, mtime );
					if ( thumbStatus( project.path, hash ) === 'ready' ) {
						thumbPathRel = thumbPaths( project.path, hash ).pngRel;
					}
				}
				let entryCount: number | undefined;
				let latestChildMtime: number | undefined;
				let childThumbPaths: string[] | undefined;
				let childTextTiles: DirEntry[ 'childTextTiles' ];
				if ( e.isDirectory() ) {
					const childRelDir = subPath
						? `${ subPath }/${ e.name }`
						: e.name;
					const summary = summarizeFolder( {
						folderAbsPath: entryPath,
						projectPath: project.path,
						projectRelDir: childRelDir,
					} );
					if ( summary ) {
						entryCount = summary.entryCount;
						latestChildMtime = summary.latestChildMtime;
						childThumbPaths =
							summary.childThumbPaths.length > 0
								? summary.childThumbPaths
								: undefined;
						childTextTiles =
							summary.childTextTiles.length > 0
								? summary.childTextTiles
								: undefined;
					}
				}
				return {
					name: e.name,
					isDirectory: e.isDirectory(),
					mtime,
					excerpt: excerpt ?? undefined,
					thumbPath: thumbPathRel,
					entryCount,
					latestChildMtime,
					childThumbPaths,
					childTextTiles,
				};
			} );
		mapped.sort( ( a, b ) => {
			if ( a.isDirectory !== b.isDirectory ) {
				return a.isDirectory ? -1 : 1;
			}
			return a.name.localeCompare( b.name );
		} );
		return mapped;
	},
} );
