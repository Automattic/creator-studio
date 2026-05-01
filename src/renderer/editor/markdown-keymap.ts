import { indentLess, indentMore } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import type { Command, KeyBinding } from '@codemirror/view';

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
