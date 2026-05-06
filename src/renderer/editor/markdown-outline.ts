import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export type Heading = {
	level: number;
	line: number;
	pos: number;
	text: string;
};

const HEADING_NODE_LEVEL: Record< string, number > = {
	ATXHeading1: 1,
	ATXHeading2: 2,
	ATXHeading3: 3,
	ATXHeading4: 4,
	ATXHeading5: 5,
	ATXHeading6: 6,
};

const LEADING_MARKS = /^#{1,6}\s*/;
const TRAILING_HASHES = /\s+#+\s*$/;

export function extractHeadings( state: EditorState ): Heading[] {
	const headings: Heading[] = [];
	syntaxTree( state ).iterate( {
		enter: ( node ) => {
			const level = HEADING_NODE_LEVEL[ node.name ];
			if ( ! level ) {
				return;
			}
			const line = state.doc.lineAt( node.from );
			const raw = state.doc.sliceString( node.from, node.to );
			const text = raw
				.replace( LEADING_MARKS, '' )
				.replace( TRAILING_HASHES, '' )
				.trim();
			headings.push( {
				level,
				line: line.number,
				pos: line.from,
				text,
			} );
		},
	} );
	return headings;
}

export function headingsEqual( a: Heading[], b: Heading[] ): boolean {
	if ( a.length !== b.length ) {
		return false;
	}
	for ( let i = 0; i < a.length; i++ ) {
		const x = a[ i ];
		const y = b[ i ];
		if (
			x.level !== y.level ||
			x.line !== y.line ||
			x.pos !== y.pos ||
			x.text !== y.text
		) {
			return false;
		}
	}
	return true;
}

// Active heading = the last entry whose line is ≤ the cursor line. Anything
// before the first heading returns -1, so the panel can render no active row
// when the cursor sits in the preamble.
export function activeHeadingIndex(
	headings: Heading[],
	cursorLine: number
): number {
	let active = -1;
	for ( let i = 0; i < headings.length; i++ ) {
		if ( headings[ i ].line <= cursorLine ) {
			active = i;
		} else {
			break;
		}
	}
	return active;
}
