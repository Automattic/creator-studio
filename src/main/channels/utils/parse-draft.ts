import matter from 'gray-matter';

const MAX_DESCRIPTION_LEN = 240;

export type ParsedDraft = {
	title: string;
	description: string;
	wordCount: number;
};

function asString( value: unknown ): string | null {
	if ( typeof value !== 'string' ) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function truncate( text: string, max: number ): string {
	if ( text.length <= max ) {
		return text;
	}
	return text.slice( 0, max - 1 ).trimEnd() + '…';
}

// Drop fenced code blocks before counting and before grabbing the first
// paragraph. Code shouldn't pad the word count or surface as a description.
function stripFencedCode( markdown: string ): string {
	return markdown.replace( /```[\s\S]*?```/g, '' );
}

// Strip the markdown formatting most likely to surface in a single-line
// preview (heading hashes, blockquote `>`, list bullets, `*`/`_` emphasis).
// Intentionally light — full markdown rendering is out of scope.
function tidyParagraph( raw: string ): string {
	let text = raw.replace( /\r\n/g, '\n' );
	text = text.replace( /^\s*[#>\-*]+\s*/, '' );
	text = text.replace( /[*_]+([^*_]+)[*_]+/g, '$1' );
	return text.replace( /\s+/g, ' ' ).trim();
}

function firstParagraph( markdown: string ): string {
	const stripped = stripFencedCode( markdown ).trim();
	if ( ! stripped ) {
		return '';
	}
	const paragraphs = stripped.split( /\n\s*\n/ );
	for ( const para of paragraphs ) {
		const cleaned = tidyParagraph( para );
		if ( cleaned ) {
			return cleaned;
		}
	}
	return '';
}

function countWords( markdown: string ): number {
	const stripped = stripFencedCode( markdown ).trim();
	if ( ! stripped ) {
		return 0;
	}
	const tokens = stripped.split( /\s+/ ).filter( ( t ) => t.length > 0 );
	return tokens.length;
}

export function parseDraft( raw: string, fileName: string ): ParsedDraft {
	const parsed = matter( raw );
	const data = parsed.data as Record< string, unknown >;
	const content = parsed.content;

	const title = asString( data.title ) ?? fileName.replace( /\.md$/i, '' );
	const descriptionFromMatter =
		asString( data.description ) ?? asString( data.excerpt );
	const description = truncate(
		descriptionFromMatter ?? firstParagraph( content ),
		MAX_DESCRIPTION_LEN
	);
	const wordCount = countWords( content );

	return { title, description, wordCount };
}
