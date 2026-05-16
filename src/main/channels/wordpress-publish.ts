import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { wpFetch } from './utils/wordpress-client';
import { markdownToHtml } from './utils/wordpress-markdown';
import { getConnection, toPublic } from './utils/wordpress-store';
import { IpcChannels } from '.';

const Input = z.object( {
	projectId: z.string().min( 1 ),
	relPath: z.string().min( 1 ),
	folder: z.enum( [ 'drafts', 'done' ] ).default( 'drafts' ),
	connectionId: z.string().min( 1 ),
} );

export type WordpressPublishResult =
	| {
			ok: true;
			postId: number;
			link: string;
			status: string;
			connection: ReturnType< typeof toPublic >;
	  }
	| {
			ok: false;
			reason:
				| 'project-not-found'
				| 'connection-not-found'
				| 'draft-not-found'
				| 'unauthorized'
				| 'forbidden'
				| 'http-error'
				| 'network';
			status?: number;
			message?: string;
	  };

function readPostId( raw: unknown ): number | undefined {
	if ( typeof raw === 'number' && Number.isFinite( raw ) ) {
		return raw;
	}
	if ( typeof raw === 'string' && /^\d+$/.test( raw ) ) {
		return Number( raw );
	}
	return undefined;
}

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

// WordPress returns the canonical post object on POST/PUT. We pluck
// the fields we care about, defaulting through optionals because
// older WP versions can ship leaner payloads.
type WpPostResponse = {
	id: number;
	link?: string;
	status?: string;
	modified?: string;
	modified_gmt?: string;
};

export const wordpressPublish = defineChannel( {
	name: IpcChannels.wordpressPublish,
	input: Input,
	handle: async ( input ): Promise< WordpressPublishResult > => {
		const project = getProject( input.projectId );
		if ( ! project ) {
			return { ok: false, reason: 'project-not-found' };
		}
		const connection = getConnection( input.connectionId );
		if ( ! connection ) {
			return { ok: false, reason: 'connection-not-found' };
		}

		const target = resolveInside(
			project.path,
			path.join( input.folder, input.relPath )
		);
		if ( ! target ) {
			return { ok: false, reason: 'draft-not-found' };
		}
		let raw: string;
		try {
			raw = fs.readFileSync( target, 'utf-8' );
		} catch {
			return { ok: false, reason: 'draft-not-found' };
		}
		const parsed = matter( raw );
		const frontmatter = parsed.data as Record< string, unknown >;
		const body = parsed.content;

		const titleFromFm =
			typeof frontmatter.title === 'string' && frontmatter.title.trim()
				? ( frontmatter.title as string )
				: input.relPath.replace( /\.md$/i, '' );
		const html = await markdownToHtml( body );

		// Decide POST vs PUT. We only reuse the existing wp_post_id when
		// it was set for THIS connection — otherwise treat it as a fresh
		// publish (the original site might have been disconnected).
		const fmConnectionId =
			typeof frontmatter.wp_connection_id === 'string'
				? frontmatter.wp_connection_id
				: undefined;
		const fmPostId = readPostId( frontmatter.wp_post_id );
		const updatingExisting =
			fmConnectionId === connection.id && fmPostId !== undefined;

		const apiPath = updatingExisting
			? `wp/v2/posts/${ fmPostId }`
			: 'wp/v2/posts';
		const method = updatingExisting ? 'PUT' : 'POST';
		const requestBody = JSON.stringify( {
			title: titleFromFm,
			content: html,
			status: 'publish',
		} );

		const result = await wpFetch< WpPostResponse >( connection, apiPath, {
			method,
			body: requestBody,
		} );
		if ( result.ok === false ) {
			let reason: 'unauthorized' | 'forbidden' | 'network' | 'http-error';
			if ( result.reason === 'unauthorized' ) {
				reason = 'unauthorized';
			} else if ( result.reason === 'forbidden' ) {
				reason = 'forbidden';
			} else if ( result.reason === 'network' ) {
				reason = 'network';
			} else {
				reason = 'http-error';
			}
			return {
				ok: false,
				reason,
				status: result.status,
				message: result.message,
			};
		}

		// Merge the WP-side identity back into the file's frontmatter so
		// the next publish updates instead of duplicating, and the share
		// panel can show a "view live post" link without another fetch.
		const nextFrontmatter: Record< string, unknown > = {
			...frontmatter,
			wp_connection_id: connection.id,
			wp_post_id: result.data.id,
			wp_link: result.data.link ?? frontmatter.wp_link ?? '',
			wp_status: result.data.status ?? 'publish',
		};
		if ( result.data.modified ) {
			nextFrontmatter.wp_modified = result.data.modified;
		}
		try {
			const assembled = matter.stringify( body, nextFrontmatter );
			fs.writeFileSync( target, assembled, 'utf-8' );
		} catch {
			// Publish landed on WP but local frontmatter write failed.
			// We return ok anyway since the post is live — the user can
			// retry to re-sync the frontmatter on next publish.
		}

		return {
			ok: true,
			postId: result.data.id,
			link: result.data.link ?? '',
			status: result.data.status ?? 'publish',
			connection: toPublic( connection ),
		};
	},
} );
