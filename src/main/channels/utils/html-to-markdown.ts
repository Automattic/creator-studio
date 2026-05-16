import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// Single shared service. Turndown is mostly stateless across calls,
// so reusing the same instance avoids re-registering GFM rules per
// imported post.
const service = new TurndownService( {
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
	emDelimiter: '_',
	hr: '---',
	linkStyle: 'inlined',
} );
service.use( gfm );

export function htmlToMarkdown( html: string ): string {
	return service.turndown( html );
}
