import { indentLess, indentMore } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorView, type Command, type KeyBinding } from '@codemirror/view';

// Wrap the current selection with `marker` on both sides. Empty selection
// inserts the markers and places the cursor between them so the user can
// type into the freshly-formatted text.
function wrap( marker: string ): Command {
	return ( view ) => {
		const { state } = view;
		const main = state.selection.main;
		const selectedText = state.doc.sliceString( main.from, main.to );
		const insert = `${ marker }${ selectedText }${ marker }`;
		view.dispatch( {
			changes: { from: main.from, to: main.to, insert },
			selection: selectedText
				? {
						anchor: main.from + marker.length,
						head: main.from + marker.length + selectedText.length,
				  }
				: { anchor: main.from + marker.length },
		} );
		return true;
	};
}

export const applyBold: Command = wrap( '**' );
export const applyItalic: Command = wrap( '*' );
export const applyStrikethrough: Command = wrap( '~~' );
export const applyInlineCode: Command = wrap( '`' );

export const applyLink: Command = ( view ) => {
	const { state } = view;
	const main = state.selection.main;
	const selectedText = state.doc.sliceString( main.from, main.to );
	const linkText = selectedText || 'text';
	const insert = `[${ linkText }]()`;
	view.dispatch( {
		changes: { from: main.from, to: main.to, insert },
		// Place the cursor inside the empty parens so the user types the URL.
		selection: { anchor: main.from + linkText.length + 3 },
	} );
	return true;
};

export const markdownFormattingBindings: readonly KeyBinding[] = [
	{ key: 'Mod-b', run: applyBold },
	{ key: 'Mod-i', run: applyItalic },
	{ key: 'Mod-k', run: applyLink },
];

// Returns true when the syntax tree at `pos` is inside a list item (bullet,
// ordered, or task). We walk parents because the cursor could be on the
// ListMark, the inline content, or inside a nested span like Strong.
function isInListItem(
	view: Parameters< Command >[ 0 ],
	pos: number
): boolean {
	let node: ReturnType< typeof syntaxTree >[ 'topNode' ] | null = syntaxTree(
		view.state
	).resolveInner( pos, -1 );
	while ( node ) {
		if (
			node.name === 'ListItem' ||
			node.name === 'Task' ||
			node.name === 'BulletList' ||
			node.name === 'OrderedList'
		) {
			return true;
		}
		if ( ! node.parent ) {
			break;
		}
		node = node.parent;
	}
	return false;
}

// Indent the current list item one level when Tab is pressed inside a list.
// Returns false when the cursor is not in a list so the next keymap entry
// (insertTab) inserts a literal tab character instead.
const tabIndentInList: Command = ( view ) => {
	const main = view.state.selection.main;
	if ( ! main.empty ) {
		return false;
	}
	if ( ! isInListItem( view, main.from ) ) {
		return false;
	}
	return indentMore( view );
};

// Mirror of tabIndentInList for Shift+Tab: outdent the list item if we're in
// a list, otherwise let the next binding handle it (indentLess removes
// leading whitespace on plain lines too).
const shiftTabOutdentInList: Command = ( view ) => {
	const main = view.state.selection.main;
	if ( ! main.empty ) {
		return false;
	}
	if ( ! isInListItem( view, main.from ) ) {
		return false;
	}
	return indentLess( view );
};

export const markdownTabBindings: readonly KeyBinding[] = [
	{ key: 'Tab', run: tabIndentInList, shift: shiftTabOutdentInList },
];

// Arrow-key traversal between the body and the title input that lives just
// above the editor. The screen passes a `focusTitle` callback that focuses
// the input and parks the caret at end-of-value.
type FocusTitle = () => void;

// Walks the syntax tree at `pos` and reports which inline-formatting
// markers wrap that position. Used by the toolbar to light up B/I/etc.
export type InlineFormatFlags = {
	bold: boolean;
	italic: boolean;
	strikethrough: boolean;
	code: boolean;
	link: boolean;
};

export function inlineFormatAt(
	view: Parameters< Command >[ 0 ],
	pos: number
): InlineFormatFlags {
	const flags: InlineFormatFlags = {
		bold: false,
		italic: false,
		strikethrough: false,
		code: false,
		link: false,
	};
	let node: ReturnType< typeof syntaxTree >[ 'topNode' ] | null = syntaxTree(
		view.state
	).resolveInner( pos, -1 );
	while ( node ) {
		switch ( node.name ) {
			case 'StrongEmphasis':
				flags.bold = true;
				break;
			case 'Emphasis':
				flags.italic = true;
				break;
			case 'Strikethrough':
				flags.strikethrough = true;
				break;
			case 'InlineCode':
				flags.code = true;
				break;
			case 'Link':
				flags.link = true;
				break;
		}
		if ( ! node.parent ) {
			break;
		}
		node = node.parent;
	}
	return flags;
}

// ArrowUp on doc line 1 (any column) escapes upward to the title.
export function escapeUpToTitle( focusTitle: FocusTitle ): Command {
	return ( view ) => {
		const main = view.state.selection.main;
		if ( ! main.empty ) {
			return false;
		}
		const line = view.state.doc.lineAt( main.from );
		if ( line.number !== 1 ) {
			return false;
		}
		focusTitle();
		return true;
	};
}

// ArrowLeft at the very start of the doc escapes to the title.
export function escapeLeftToTitle( focusTitle: FocusTitle ): Command {
	return ( view ) => {
		const main = view.state.selection.main;
		if ( ! main.empty || main.from !== 0 ) {
			return false;
		}
		focusTitle();
		return true;
	};
}

// Strip every recognized block prefix on the current line: heading marks,
// bullet/ordered/task list markers, blockquote `>`. Leaves leading
// whitespace untouched so nested-list outdent is a separate concern.
function stripBlockPrefix( text: string ): { leading: string; rest: string } {
	const m = text.match( /^(\s*)(.*)$/ );
	const leading = m?.[ 1 ] ?? '';
	let rest = m?.[ 2 ] ?? '';
	rest = rest
		.replace( /^#{1,6}\s+/, '' )
		.replace( /^>\s+/, '' )
		.replace( /^[-*+]\s+\[[ xX]\]\s+/, '' )
		.replace( /^[-*+]\s+/, '' )
		.replace( /^\d+\.\s+/, '' );
	return { leading, rest };
}

function rewriteLine( view: Parameters< Command >[ 0 ], next: string ): void {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	view.dispatch( {
		changes: { from: line.from, to: line.to, insert: next },
	} );
}

// Toggle a heading level on the line containing the cursor. Same level
// strips the marker (returns to paragraph); different level replaces it.
export function toggleHeading( level: number ): Command {
	return ( view ) => {
		const main = view.state.selection.main;
		const line = view.state.doc.lineAt( main.from );
		const match = line.text.match( /^(\s*)(#{1,6})\s+(.*)$/ );
		const marker = '#'.repeat( level );
		let next: string;
		if ( match && match[ 2 ].length === level ) {
			next = `${ match[ 1 ] }${ match[ 3 ] }`;
		} else {
			const stripped = stripBlockPrefix( line.text );
			next = `${ stripped.leading }${ marker } ${ stripped.rest }`;
		}
		rewriteLine( view, next );
		return true;
	};
}

// Toggle the current line as an unordered list item.
export const toggleBulletList: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const isBullet = /^(\s*)[-*+]\s+(?!\[)/.test( line.text );
	if ( isBullet ) {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }${ stripped.rest }` );
	} else {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }- ${ stripped.rest }` );
	}
	return true;
};

// Toggle the current line as a numbered list item. Always inserts `1. ` —
// the markdown renderer auto-numbers regardless of the literal digit.
export const toggleNumberedList: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const isNumbered = /^(\s*)\d+\.\s+/.test( line.text );
	if ( isNumbered ) {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }${ stripped.rest }` );
	} else {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }1. ${ stripped.rest }` );
	}
	return true;
};

// Toggle the current line as a task-list item.
export const toggleTaskList: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const isTask = /^(\s*)[-*+]\s+\[[ xX]\]\s+/.test( line.text );
	if ( isTask ) {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }${ stripped.rest }` );
	} else {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }- [ ] ${ stripped.rest }` );
	}
	return true;
};

// Toggle the current line as a blockquote.
export const toggleQuote: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const isQuote = /^(\s*)>\s+/.test( line.text );
	if ( isQuote ) {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }${ stripped.rest }` );
	} else {
		const stripped = stripBlockPrefix( line.text );
		rewriteLine( view, `${ stripped.leading }> ${ stripped.rest }` );
	}
	return true;
};

// Strip any recognized block prefix on the current line (paragraph mode).
export const setParagraph: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const stripped = stripBlockPrefix( line.text );
	rewriteLine( view, `${ stripped.leading }${ stripped.rest }` );
	return true;
};

// Insert a horizontal rule on its own line at the cursor.
export const insertHr: Command = ( view ) => {
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt( main.from );
	const atLineStart = main.from === line.from;
	const insert = atLineStart ? '---\n' : '\n\n---\n\n';
	view.dispatch( {
		changes: { from: main.from, to: main.to, insert },
		selection: { anchor: main.from + insert.length },
	} );
	return true;
};

// Strip common inline markdown markers from the selection. Best-effort:
// removes wrapping `**`/`__`/`*`/`_`/`~~`/`` ` `` pairs and converts
// `[text](url)` to `text`. Markers that span outside the selection are
// left alone — partial-strip is intentionally undefined.
export const clearInlineFormatting: Command = ( view ) => {
	const main = view.state.selection.main;
	if ( main.empty ) {
		return false;
	}
	const original = view.state.doc.sliceString( main.from, main.to );
	let cleaned = original;
	// Repeat until stable so nested formatting unwraps in one pass.
	let prev = '';
	while ( prev !== cleaned ) {
		prev = cleaned;
		cleaned = cleaned
			.replace( /\*\*([^*]+)\*\*/g, '$1' )
			.replace( /__([^_]+)__/g, '$1' )
			.replace( /\*([^*]+)\*/g, '$1' )
			.replace( /_([^_]+)_/g, '$1' )
			.replace( /~~([^~]+)~~/g, '$1' )
			.replace( /`([^`]+)`/g, '$1' )
			.replace( /\[([^\]]+)\]\([^)]*\)/g, '$1' );
	}
	if ( cleaned === original ) {
		return false;
	}
	view.dispatch( {
		changes: { from: main.from, to: main.to, insert: cleaned },
		selection: {
			anchor: main.from,
			head: main.from + cleaned.length,
		},
	} );
	return true;
};

export const markdownBlockBindings: readonly KeyBinding[] = [
	{ key: 'Mod-Shift-l', run: toggleBulletList },
	{ key: 'Mod-Shift-1', run: toggleHeading( 1 ) },
	{ key: 'Mod-Shift-2', run: toggleHeading( 2 ) },
	{ key: 'Mod-Shift-3', run: toggleHeading( 3 ) },
	{ key: 'Mod-Shift-4', run: toggleHeading( 4 ) },
	{ key: 'Mod-Shift-5', run: toggleHeading( 5 ) },
	{ key: 'Mod-Shift-6', run: toggleHeading( 6 ) },
];

// Wrap a non-empty selection with markdown emphasis markers when the user
// types `*`, `_`, `~`, or `` ` ``. closeBrackets handles `(`, `[`, `{`,
// `"`, `'`, `` ` ``; this fills the markdown-flavored gap. Skips when there
// is no selection so a normal keystroke still types the character.
const SMART_WRAP_CHARS = new Set( [ '*', '_', '~' ] );

export const smartSelectionWrap = EditorView.inputHandler.of(
	( view, _from, _to, text ) => {
		if ( text.length !== 1 || ! SMART_WRAP_CHARS.has( text ) ) {
			return false;
		}
		const { state } = view;
		if ( state.selection.ranges.every( ( r ) => r.empty ) ) {
			return false;
		}
		const changes = state.changes(
			state.selection.ranges.flatMap( ( range ) =>
				range.empty
					? []
					: [
							{ from: range.from, insert: text },
							{ from: range.to, insert: text },
					  ]
			)
		);
		view.dispatch( {
			changes,
			selection: state.selection.map( changes ),
			userEvent: 'input.type',
		} );
		return true;
	}
);

// `paste` listener that turns "select word, paste URL" into a markdown link.
// Falls through to normal paste when the clipboard isn't a URL or the
// selection is empty.
const URL_RE = /^https?:\/\/[^\s]+$/;

export const pasteUrlAsLink = EditorView.domEventHandlers( {
	paste( event, view ) {
		const main = view.state.selection.main;
		if ( main.empty ) {
			return false;
		}
		const clip = event.clipboardData?.getData( 'text/plain' )?.trim();
		if ( ! clip || ! URL_RE.test( clip ) ) {
			return false;
		}
		const selected = view.state.doc.sliceString( main.from, main.to );
		event.preventDefault();
		view.dispatch( {
			changes: {
				from: main.from,
				to: main.to,
				insert: `[${ selected }](${ clip })`,
			},
			userEvent: 'input.paste',
		} );
		return true;
	},
} );
