// Models are asked for bare JSON but sometimes wrap it in a ```json fence
// or a short preamble. These helpers pull the first JSON array/object out
// of a response by bracket index — looser than a parser, strict enough
// that genuinely malformed output throws. Shared by the checks runner,
// the language aid, and Coach so the tolerance stays identical.

function extract( raw: string, open: '[' | '{', close: ']' | '}' ): unknown {
	const trimmed = raw.trim();
	if ( trimmed.startsWith( open ) ) {
		return JSON.parse( trimmed );
	}
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec( trimmed );
	if ( fenced ) {
		return JSON.parse( fenced[ 1 ].trim() );
	}
	const start = trimmed.indexOf( open );
	const end = trimmed.lastIndexOf( close );
	if ( start !== -1 && end !== -1 && end > start ) {
		return JSON.parse( trimmed.slice( start, end + 1 ) );
	}
	throw new Error(
		`no JSON ${ open === '[' ? 'array' : 'object' } in model output`
	);
}

export function parseJsonArray( raw: string ): unknown {
	return extract( raw, '[', ']' );
}

export function parseJsonObject( raw: string ): unknown {
	return extract( raw, '{', '}' );
}
