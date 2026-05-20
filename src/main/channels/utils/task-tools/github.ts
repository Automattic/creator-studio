import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// GitHub owner / repo / user names: alphanumerics plus - _ . — strip anything
// else so an argument can't escape the API path.
function safeName( raw: string ): string {
	return raw.replace( /[^a-zA-Z0-9_.-]/g, '' );
}

const GH_HEADERS = {
	'X-GitHub-Api-Version': '2022-11-28',
};

export const githubActivityTool = tool(
	'github_activity',
	"Fetch recent public GitHub activity. Provide `user` for a person's " +
		"public events, or `owner` + `repo` for a repository's recent " +
		'commits, releases, or events. Returns raw JSON from the GitHub API.',
	{
		owner: z
			.string()
			.optional()
			.describe( 'Repository owner (use with `repo`).' ),
		repo: z
			.string()
			.optional()
			.describe( 'Repository name (use with `owner`).' ),
		user: z
			.string()
			.optional()
			.describe( "A GitHub username, for that account's public events." ),
		kind: z
			.enum( [ 'events', 'commits', 'releases' ] )
			.optional()
			.describe(
				'For a repository: which feed to fetch. Defaults to commits.'
			),
	},
	async ( args ) => {
		let url: string;
		if ( args.user ) {
			url = `https://api.github.com/users/${ safeName(
				args.user
			) }/events/public`;
		} else if ( args.owner && args.repo ) {
			const slug = `${ safeName( args.owner ) }/${ safeName(
				args.repo
			) }`;
			const kind = args.kind ?? 'commits';
			url = `https://api.github.com/repos/${ slug }/${ kind }`;
		} else {
			return toolError(
				'github_activity needs either `user`, or both `owner` and `repo`.'
			);
		}
		try {
			const res = await httpGet( url, {
				accept: 'application/vnd.github+json',
				headers: GH_HEADERS,
			} );
			if ( res.status === 403 || res.status === 429 ) {
				return toolError(
					'GitHub rate limit reached (unauthenticated requests are ' +
						'limited). Try again later.'
				);
			}
			if ( ! res.ok ) {
				return toolError(
					`GitHub request failed (HTTP ${ res.status }) for ${ url }.`
				);
			}
			return toolText( res.body );
		} catch ( err ) {
			return toolError(
				`GitHub request failed: ${ errMessage( err ) }.`
			);
		}
	}
);
