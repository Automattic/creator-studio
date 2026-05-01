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

const insertLink: Command = ( view ) => {
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
	{ key: 'Mod-b', run: wrap( '**' ) },
	{ key: 'Mod-i', run: wrap( '*' ) },
	{ key: 'Mod-k', run: insertLink },
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

// Toggle a heading level on the line containing the cursor. If the line is
// already a heading at the same level, the marker is removed; if it is a
// different level the marker is replaced; otherwise the marker is prepended.
function toggleHeading( level: number ): Command {
	return ( view ) => {
		const { state } = view;
		const main = state.selection.main;
		const line = state.doc.lineAt( main.from );
		const match = line.text.match( /^(#{1,6})\s+(.*)$/ );
		const marker = '#'.repeat( level );
		let nextText: string;
		if ( match ) {
			if ( match[ 1 ].length === level ) {
				nextText = match[ 2 ];
			} else {
				nextText = `${ marker } ${ match[ 2 ] }`;
			}
		} else {
			nextText = `${ marker } ${ line.text }`;
		}
		view.dispatch( {
			changes: { from: line.from, to: line.to, insert: nextText },
		} );
		return true;
	};
}

// Toggle the current line as an unordered list item. A `- ` is added or
// removed at the start of the visible content (preserving any leading
// whitespace, so nested lines stay nested).
const toggleListLine: Command = ( view ) => {
	const { state } = view;
	const main = state.selection.main;
	const line = state.doc.lineAt( main.from );
	const bulletMatch = line.text.match( /^(\s*)[-*+]\s+(.*)$/ );
	let nextText: string;
	if ( bulletMatch ) {
		nextText = `${ bulletMatch[ 1 ] }${ bulletMatch[ 2 ] }`;
	} else {
		const leading = line.text.match( /^(\s*)(.*)$/ );
		nextText = `${ leading?.[ 1 ] ?? '' }- ${ leading?.[ 2 ] ?? '' }`;
	}
	view.dispatch( {
		changes: { from: line.from, to: line.to, insert: nextText },
	} );
	return true;
};

export const markdownBlockBindings: readonly KeyBinding[] = [
	{ key: 'Mod-Shift-l', run: toggleListLine },
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
