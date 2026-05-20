/**
 * Helpers for building MCP `CallToolResult` payloads. Kept structural so the
 * task tools don't need a direct import of the MCP SDK's types — the shape is
 * checked against `tool()`'s handler signature at each call site.
 */

export type ToolResult = {
	content: Array< { type: 'text'; text: string } >;
	isError?: boolean;
};

export function toolText( text: string ): ToolResult {
	return { content: [ { type: 'text', text } ] };
}

export function toolError( text: string ): ToolResult {
	return { content: [ { type: 'text', text } ], isError: true };
}
