import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

export const fetchFeedTool = tool(
	'fetch_feed',
	'Fetch an RSS or Atom feed and return its raw XML. Use this to check a ' +
		'feed for new items, then parse the XML yourself to extract each ' +
		'entry (title, link, published date, summary).',
	{ url: z.string().describe( 'The feed URL (http or https).' ) },
	async ( args ) => {
		try {
			const res = await httpGet( args.url, {
				accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
			} );
			if ( ! res.ok ) {
				return toolError(
					`Feed request failed (HTTP ${ res.status }) for ${ args.url }.`
				);
			}
			const note = res.truncated
				? '\n\n[Feed truncated — only the first part is shown.]'
				: '';
			return toolText( res.body + note );
		} catch ( err ) {
			return toolError(
				`Could not fetch feed ${ args.url }: ${ errMessage( err ) }.`
			);
		}
	}
);
