import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { publishMarkdownToWordpress } from '../../wordpress-publish';
import { listConnections } from '../wordpress-store';
import { toolError, toolText } from './result';

// Wiring the publish tool needs from the host. Injected by the caller so the
// tool stays a pure function of its arguments + this context.
export type WordpressMcpContext = {
	projectId: string;
};

export const listWordpressSitesTool = tool(
	'list_wordpress_sites',
	'List the WordPress sites the user has connected to Studio Write. Returns ' +
		'a JSON array of {id, label, url} entries. Call this before ' +
		'publish_to_wordpress so you know which connectionId to pass — and so ' +
		'you can ask the user which site to publish to when more than one is ' +
		'available.',
	{},
	async () => {
		const sites = listConnections().map( ( c ) => ( {
			id: c.id,
			label: c.label,
			url: c.siteUrl,
		} ) );
		if ( sites.length === 0 ) {
			return toolText(
				'No WordPress sites are connected. Ask the user to add one in ' +
					'Settings → WordPress before trying to publish.'
			);
		}
		return toolText( JSON.stringify( sites, null, 2 ) );
	}
);

function describePublishError(
	reason: string,
	status: number | undefined,
	message: string | undefined
): string {
	switch ( reason ) {
		case 'project-not-found':
			return 'The active project is no longer linked.';
		case 'connection-not-found':
			return 'No WordPress connection matches that connectionId. Call list_wordpress_sites to see the current ids.';
		case 'draft-not-found':
			return "Couldn't read the draft file from disk. Double-check the relPath and folder.";
		case 'unauthorized':
			return 'WordPress refused the credentials — the connection needs to be reconnected in Settings.';
		case 'forbidden':
			return "This WordPress account can't publish to that site.";
		case 'network':
			return 'Network error reaching WordPress — the site is unreachable.';
		case 'http-error':
		default: {
			const parts: string[] = [ 'WordPress returned an error.' ];
			if ( typeof status === 'number' ) {
				parts.push( `HTTP ${ status }.` );
			}
			if ( message ) {
				parts.push( message );
			}
			return parts.join( ' ' );
		}
	}
}

export function makePublishToWordpressTool( ctx: WordpressMcpContext ) {
	return tool(
		'publish_to_wordpress',
		'Publish a markdown draft from the current project to one of the ' +
			'connected WordPress sites. Requires the user to approve the ' +
			'publish in the UI before it runs. ' +
			'Locally-referenced images are uploaded to the WP media library, ' +
			'and the file is moved from drafts/ to done/ on success. If the ' +
			'draft was already published to the same site, this updates the ' +
			'existing post instead of creating a new one. Get connectionId ' +
			'from list_wordpress_sites.',
		{
			relPath: z
				.string()
				.min( 1 )
				.describe(
					'Path of the markdown file relative to the folder (e.g. "foo.md", not "drafts/foo.md").'
				),
			connectionId: z
				.string()
				.min( 1 )
				.describe( 'The id field from a list_wordpress_sites entry.' ),
			folder: z
				.enum( [ 'drafts', 'done' ] )
				.default( 'drafts' )
				.describe(
					"Which folder the file lives in. Defaults to 'drafts'. Use 'done' to re-publish a shipped post."
				),
		},
		async ( args ) => {
			const result = await publishMarkdownToWordpress( {
				projectId: ctx.projectId,
				relPath: args.relPath,
				folder: args.folder,
				connectionId: args.connectionId,
			} );
			if ( result.ok === false ) {
				return toolError(
					describePublishError(
						result.reason,
						result.status,
						result.message
					)
				);
			}
			const lines: string[] = [
				`Published to ${ result.connection.label } (${ result.connection.siteUrl }).`,
				`Live post: ${ result.link }`,
			];
			if ( result.movedToDone ) {
				lines.push(
					`File moved: drafts/${ args.relPath } → done/${ result.movedToDone.relPath }.`
				);
			}
			if ( result.mediaErrors.length > 0 ) {
				const samples = result.mediaErrors
					.slice( 0, 3 )
					.map( ( e ) => `  - ${ e.url }: ${ e.reason }` )
					.join( '\n' );
				lines.push(
					`Warning: ${ result.mediaErrors.length } image(s) failed to upload (the post still went live):\n${ samples }`
				);
			}
			return toolText( lines.join( '\n' ) );
		}
	);
}
