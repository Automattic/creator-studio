import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { htmlToMarkdown } from './utils/html-to-markdown';
import { pickAvailableSlug, slugifyTitle } from './utils/draft-slug';
import { defaultParentDir, sanitizeFolderName } from './project-create-new';
import { readStore, writeStore } from './utils/project-store';
import { getConnection } from './utils/wordpress-store';
import { wpFetch } from './utils/wordpress-client';
import { wordpressImportProgress } from './wordpress-import-progress';
import { IpcChannels } from '.';
import type { Project } from '../../types';

const Input = z.object( {
	name: z.string().min( 1 ),
	goal: z.string().optional(),
	parentDir: z.string().min( 1 ).optional(),
	connectionId: z.string().min( 1 ),
} );

export type WordpressImportResult =
	| { status: 'ok'; project: Project; importedCount: number }
	| { status: 'target-exists'; targetPath: string }
	| { status: 'connection-not-found' }
	| { status: 'io-error'; message: string }
	| { status: 'fetch-error'; message: string };

// Skeleton of a WP post — we only pluck the fields we care about so a
// future WP version with new attributes doesn't break the import.
type WpPost = {
	id: number;
	date?: string;
	date_gmt?: string;
	modified?: string;
	link?: string;
	slug?: string;
	status?: string;
	title?: { rendered?: string; raw?: string };
	content?: { rendered?: string; raw?: string };
	categories?: number[];
	tags?: number[];
};

type WpTerm = { id: number; name: string };

// Page size: WP REST API caps `per_page` at 100. We use the max so
// even a 500-post blog imports in 5 round-trips per status.
const PAGE_SIZE = 100;

async function fetchAllPosts(
	connection: ReturnType< typeof getConnection >,
	status: 'publish' | 'draft',
	onProgress: ( current: number, total: number | null ) => void
): Promise< { ok: true; posts: WpPost[] } | { ok: false; message: string } > {
	if ( ! connection ) {
		return { ok: false, message: 'no-connection' };
	}
	const posts: WpPost[] = [];
	let page = 1;
	while ( true ) {
		const params = new URLSearchParams( {
			status,
			per_page: String( PAGE_SIZE ),
			page: String( page ),
			context: 'edit',
		} );
		const result = await wpFetch< WpPost[] >(
			connection,
			`wp/v2/posts?${ params.toString() }`
		);
		if ( result.ok === false ) {
			// `rest_post_invalid_page_number` (400) is returned past the
			// last page. Treat it as the end of the list, not an error,
			// so we exit cleanly even if the server doesn't expose the
			// X-WP-TotalPages header (some hardened sites strip it).
			if (
				result.status === 400 &&
				result.message &&
				/invalid_page_number/.test( result.message )
			) {
				return { ok: true, posts };
			}
			return {
				ok: false,
				message: `Couldn't fetch ${ status } posts: ${ result.reason }${
					result.status ? ` (HTTP ${ result.status })` : ''
				}`,
			};
		}
		posts.push( ...result.data );
		onProgress( posts.length, null );
		if ( result.data.length < PAGE_SIZE ) {
			return { ok: true, posts };
		}
		page += 1;
	}
}

// Fetch a flat dictionary { id → name } for categories/tags so we can
// store human-readable values in frontmatter rather than just IDs.
// Soft-fails — empty dict means we just emit numeric IDs in frontmatter.
async function fetchTermNames(
	connection: ReturnType< typeof getConnection >,
	taxonomy: 'categories' | 'tags'
): Promise< Record< number, string > > {
	if ( ! connection ) {
		return {};
	}
	const out: Record< number, string > = {};
	let page = 1;
	while ( true ) {
		const params = new URLSearchParams( {
			per_page: String( PAGE_SIZE ),
			page: String( page ),
		} );
		const result = await wpFetch< WpTerm[] >(
			connection,
			`wp/v2/${ taxonomy }?${ params.toString() }`
		);
		if ( result.ok === false ) {
			return out;
		}
		for ( const term of result.data ) {
			out[ term.id ] = term.name;
		}
		if ( result.data.length < PAGE_SIZE ) {
			return out;
		}
		page += 1;
	}
}

function pickPostTitle( post: WpPost ): string {
	return (
		post.title?.raw?.trim() ||
		post.title?.rendered?.trim() ||
		post.slug ||
		`post-${ post.id }`
	);
}

function pickPostHtml( post: WpPost ): string {
	return post.content?.raw ?? post.content?.rendered ?? '';
}

function pickPostSlug( post: WpPost, title: string ): string {
	if ( post.slug && post.slug.length > 0 ) {
		return post.slug;
	}
	return slugifyTitle( title ) ?? `post-${ post.id }`;
}

function buildPostFrontmatter(
	connectionId: string,
	post: WpPost,
	statusLabel: 'publish' | 'draft',
	title: string,
	categories: Record< number, string >,
	tags: Record< number, string >
): Record< string, unknown > {
	const fm: Record< string, unknown > = {
		title,
		wp_connection_id: connectionId,
		wp_post_id: post.id,
		wp_status: statusLabel,
	};
	if ( post.link ) {
		fm.wp_link = post.link;
	}
	if ( post.modified ) {
		fm.wp_modified = post.modified;
	} else if ( post.date_gmt ) {
		fm.wp_modified = post.date_gmt;
	}
	if ( post.categories && post.categories.length > 0 ) {
		fm.wp_categories = post.categories.map(
			( id ) => categories[ id ] ?? `id:${ id }`
		);
	}
	if ( post.tags && post.tags.length > 0 ) {
		fm.wp_tags = post.tags.map( ( id ) => tags[ id ] ?? `id:${ id }` );
	}
	return fm;
}

function writePosts(
	projectPath: string,
	folder: 'drafts' | 'done',
	posts: WpPost[],
	connectionId: string,
	statusLabel: 'publish' | 'draft',
	categories: Record< number, string >,
	tags: Record< number, string >,
	onProgress: ( current: number ) => void
): number {
	const dir = path.join( projectPath, folder );
	fs.mkdirSync( dir, { recursive: true } );
	let written = 0;
	for ( const post of posts ) {
		const title = pickPostTitle( post );
		const slug = pickPostSlug( post, title );
		const filename = pickAvailableSlug( dir, slug, null );
		if ( ! filename ) {
			continue;
		}
		const html = pickPostHtml( post );
		const body = html.length > 0 ? htmlToMarkdown( html ) : '';
		const fm = buildPostFrontmatter(
			connectionId,
			post,
			statusLabel,
			title,
			categories,
			tags
		);
		const file = matter.stringify( body, fm );
		try {
			fs.writeFileSync( path.join( dir, filename ), file, 'utf-8' );
			written += 1;
			onProgress( written );
		} catch {
			// Single-file write failures are skipped — the surrounding
			// loop should still finish what it can.
		}
	}
	return written;
}

function writeImportNote(
	projectPath: string,
	connection: NonNullable< ReturnType< typeof getConnection > >,
	publishCount: number,
	draftCount: number
): void {
	const dir = path.join( projectPath, 'sources', 'notes' );
	fs.mkdirSync( dir, { recursive: true } );
	const file = path.join( dir, 'imported-from-wordpress.md' );
	const body = [
		`This project was seeded from the **${ connection.label }** site at ${ connection.siteUrl }.`,
		'',
		`- ${ publishCount } published post${
			publishCount === 1 ? '' : 's'
		} imported into \`done/\``,
		`- ${ draftCount } draft post${
			draftCount === 1 ? '' : 's'
		} imported into \`drafts/\``,
		'',
		'The goal of this project is to write new posts on this site. New drafts in `drafts/` can be published back to the site via the Share sidebar.',
	].join( '\n' );
	const fm: Record< string, unknown > = {
		title: 'Imported from WordPress',
		wp_connection_id: connection.id,
		wp_site_url: connection.siteUrl,
		wp_imported_at: new Date().toISOString(),
	};
	const out = matter.stringify( body, fm );
	try {
		fs.writeFileSync( file, out, 'utf-8' );
	} catch {
		// Note-write failure is non-fatal — the project + posts are already
		// on disk; the import is still useful without the note.
	}
}

export const wordpressImportProject = defineChannel( {
	name: IpcChannels.wordpressImportProject,
	input: Input,
	handle: async ( input, event ): Promise< WordpressImportResult > => {
		const connection = getConnection( input.connectionId );
		if ( ! connection ) {
			return { status: 'connection-not-found' };
		}

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
				return { status: 'target-exists', targetPath };
			}
		}

		try {
			fs.mkdirSync( targetPath, { recursive: true } );
		} catch ( err ) {
			return {
				status: 'io-error',
				message: err instanceof Error ? err.message : String( err ),
			};
		}

		const importId = randomUUID();
		const emit = (
			phase: 'fetching' | 'writing' | 'done',
			current: number,
			total: number | null
		): void => {
			wordpressImportProgress.emit( event.sender, {
				importId,
				phase,
				current,
				total,
			} );
		};

		emit( 'fetching', 0, null );

		const publishedResult = await fetchAllPosts(
			connection,
			'publish',
			( current ) => emit( 'fetching', current, null )
		);
		if ( publishedResult.ok === false ) {
			return { status: 'fetch-error', message: publishedResult.message };
		}
		const draftsResult = await fetchAllPosts(
			connection,
			'draft',
			( current ) =>
				emit( 'fetching', publishedResult.posts.length + current, null )
		);
		if ( draftsResult.ok === false ) {
			return { status: 'fetch-error', message: draftsResult.message };
		}

		const total = publishedResult.posts.length + draftsResult.posts.length;
		emit( 'writing', 0, total );

		const [ categoryNames, tagNames ] = await Promise.all( [
			fetchTermNames( connection, 'categories' ),
			fetchTermNames( connection, 'tags' ),
		] );

		const publishedWritten = writePosts(
			targetPath,
			'done',
			publishedResult.posts,
			connection.id,
			'publish',
			categoryNames,
			tagNames,
			( current ) => emit( 'writing', current, total )
		);
		const draftsWritten = writePosts(
			targetPath,
			'drafts',
			draftsResult.posts,
			connection.id,
			'draft',
			categoryNames,
			tagNames,
			( current ) => emit( 'writing', publishedWritten + current, total )
		);

		writeImportNote(
			targetPath,
			connection,
			publishedWritten,
			draftsWritten
		);

		// Register the project in the store so it shows up in the
		// project list. Goal text comes from the modal input; if the
		// user didn't type one we seed a sensible default pointing the
		// agent at "writing new posts on this site".
		const store = readStore();
		const goal =
			input.goal?.trim() ||
			`Imported from ${ connection.label } (${ connection.siteUrl }). Use this project to draft and publish new posts on that site.`;
		const project: Project = {
			id: randomUUID(),
			path: targetPath,
			label: folder,
			name: input.name.trim(),
			goal,
		};
		store.projects.push( project );
		writeStore( store );

		emit( 'done', publishedWritten + draftsWritten, total );

		return {
			status: 'ok',
			project,
			importedCount: publishedWritten + draftsWritten,
		};
	},
} );
