/**
 * Helpers for building MCP `CallToolResult` payloads. Kept structural so the
 * task tools don't need a direct import of the MCP SDK's types — the shape is
 * checked against `tool()`'s handler signature at each call site.
 */

export type ToolResult = {
	content: Array< { type: 'text'; text: string } >;
	isError?: boolean;
};

// Hard ceiling on the text any tool hands back to the model. The host caps an
// MCP tool result at ~25k tokens; past that it spills the payload to a file the
// model can't read inline, which forces a shell/python fallback. 60k chars is a
// safe margin under that cap across both prose and dense JSON. Tools that return
// structured data should slim it well below this — the cap is only a net so a
// surprise (a giant feed, an unexpected API shape) can never break the run.
export const MAX_RESULT_CHARS = 60_000;

const TRUNCATION_NOTE =
	'\n\n[Output truncated — it was too large to return in full. ' +
	'Fetch a narrower slice or a specific item if you need more.]';

function capText( text: string ): string {
	if ( text.length <= MAX_RESULT_CHARS ) {
		return text;
	}
	return (
		text.slice( 0, MAX_RESULT_CHARS - TRUNCATION_NOTE.length ) +
		TRUNCATION_NOTE
	);
}

export function toolText( text: string ): ToolResult {
	return { content: [ { type: 'text', text: capText( text ) } ] };
}

export function toolError( text: string ): ToolResult {
	return { content: [ { type: 'text', text } ], isError: true };
}
