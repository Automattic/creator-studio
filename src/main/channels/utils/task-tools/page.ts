import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// Cheap, dependency-free readability pass: drop the parts of an HTML document
// that carry no prose, unwrap the remaining tags, and decode the handful of
// entities that show up in body text. Good enough for the agent to read an
// article from; not a full DOM parse.
function stripHtml( html: string ): string {
	return html
		.replace( /<!--[\s\S]*?-->/g, ' ' )
		.replace( /<script\b[\s\S]*?<\/script>/gi, ' ' )
		.replace( /<style\b[\s\S]*?<\/style>/gi, ' ' )
		.replace( /<svg\b[\s\S]*?<\/svg>/gi, ' ' )
		.replace( /<head\b[\s\S]*?<\/head>/gi, ' ' )
		.replace( /<noscript\b[\s\S]*?<\/noscript>/gi, ' ' )
		.replace( /<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n' )
		.replace( /<[^>]+>/g, ' ' )
		.replace( /&nbsp;/g, ' ' )
		.replace( /&amp;/g, '&' )
		.replace( /&lt;/g, '<' )
		.replace( /&gt;/g, '>' )
		.replace( /&quot;/g, '"' )
		.replace( /&#3[49];/g, "'" )
		.replace( /[ \t]+/g, ' ' )
		.replace( /\n[ \t]+/g, '\n' )
		.replace( /\n{3,}/g, '\n\n' )
		.trim();
}

export const fetchPageTool = tool(
	'fetch_page',
	'Fetch a web page and return its readable text content (scripts, styles ' +
		'and markup removed). Use this to read an article or check what a ' +
		'page currently says.',
	{ url: z.string().describe( 'The page URL (http or https).' ) },
	async ( args ) => {
		try {
			const res = await httpGet( args.url, {
				accept: 'text/html, application/xhtml+xml, text/plain, */*',
			} );
			if ( ! res.ok ) {
				return toolError(
					`Page request failed (HTTP ${ res.status }) for ${ args.url }.`
				);
			}
			const isHtml = /html|xml/i.test( res.contentType );
			const text = isHtml ? stripHtml( res.body ) : res.body;
			const note = res.truncated
				? '\n\n[Page truncated — only the first part is shown.]'
				: '';
			return toolText( text + note );
		} catch ( err ) {
			return toolError(
				`Could not fetch page ${ args.url }: ${ errMessage( err ) }.`
			);
		}
	}
);
