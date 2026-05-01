import type { Command, KeyBinding } from '@codemirror/view';

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
