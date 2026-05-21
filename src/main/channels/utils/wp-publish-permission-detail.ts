import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { getProject } from './project-get';
import { getConnection, toPublic } from './wordpress-store';
import type { PermissionRequestDetail } from '../../../types';

// Resolve the structured context PermissionPrompt needs to render the tailored
// "Publish to WordPress" card. Returns `undefined` when the input shape is
// wrong or any required piece (project, connection, draft file) is missing —
// the renderer then falls back to the generic JSON view, and the user can
// still decide based on raw input.
export function buildPublishPermissionDetail(
	projectId: string,
	input: unknown
): PermissionRequestDetail | undefined {
	if ( typeof input !== 'object' || input === null ) {
		return undefined;
	}
	const rec = input as Record< string, unknown >;
	const relPath = typeof rec.relPath === 'string' ? rec.relPath : null;
	const connectionId =
		typeof rec.connectionId === 'string' ? rec.connectionId : null;
	const folderRaw = typeof rec.folder === 'string' ? rec.folder : 'drafts';
	const folder: 'drafts' | 'done' = folderRaw === 'done' ? 'done' : 'drafts';
	if ( ! relPath || ! connectionId ) {
		return undefined;
	}

	const connection = getConnection( connectionId );
	if ( ! connection ) {
		return undefined;
	}
	const publicConnection = toPublic( connection );

	const project = getProject( projectId );
	const draftTitle = project
		? readDraftTitle( project.path, folder, relPath )
		: null;

	return {
		kind: 'wp-publish',
		connectionLabel: publicConnection.label,
		connectionSiteUrl: publicConnection.siteUrl,
		draftRelPath: relPath,
		draftFolder: folder,
		draftTitle,
	};
}

function readDraftTitle(
	projectPath: string,
	folder: 'drafts' | 'done',
	relPath: string
): string | null {
	const target = path.resolve( projectPath, folder, relPath );
	const rootResolved = path.resolve( projectPath );
	if (
		target !== rootResolved &&
		! target.startsWith( rootResolved + path.sep )
	) {
		return null;
	}
	let raw: string;
	try {
		raw = fs.readFileSync( target, 'utf-8' );
	} catch {
		return null;
	}
	try {
		const parsed = matter( raw );
		const t = ( parsed.data as Record< string, unknown > ).title;
		if ( typeof t === 'string' && t.trim() ) {
			return t.trim();
		}
	} catch {
		// Malformed frontmatter — fall through.
	}
	return null;
}
