import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

// Walks up from the syntax-tree node at `pos` to find an enclosing Link or
// Autolink, then returns its URL substring. Returns null when the position
// isn't on a link.
function urlAtPos( view: EditorView, pos: number ): string | null {
	const tree = syntaxTree( view.state );
	let node: ReturnType< typeof tree.resolveInner > | null = tree.resolveInner(
		pos,
		1
	);
	while ( node ) {
		if ( node.name === 'URL' ) {
			return view.state.doc.sliceString( node.from, node.to ).trim();
		}
		if ( node.name === 'Autolink' ) {
			// Autolink covers the entire <url>; strip the angle brackets if
			// present (markdown inline autolinks `<https://…>`), otherwise
			// take the whole node.
			const raw = view.state.doc.sliceString( node.from, node.to ).trim();
			return raw.replace( /^<|>$/g, '' );
		}
		if ( node.name === 'Link' ) {
			// Walk children to find the URL child specifically.
			const cursor = node.node.cursor();
			if ( cursor.firstChild() ) {
				do {
					if ( cursor.name === 'URL' ) {
						return view.state.doc
							.sliceString( cursor.from, cursor.to )
							.trim();
					}
				} while ( cursor.nextSibling() );
			}
			return null;
		}
		if ( ! node.parent ) {
			break;
		}
		node = node.parent;
	}
	return null;
}

// Cmd+Click (or Ctrl+Click on non-Mac) on a markdown link or autolink opens
// the URL in the user's default browser. The link decoration hides the URL
// text when the cursor is off the line, but the doc model still has it —
// we read from the syntax tree, not from the DOM.
export const markdownLinkClick = EditorView.domEventHandlers( {
	mousedown( event, view ) {
		const isMac = navigator.platform.toLowerCase().includes( 'mac' );
		const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
		if ( ! modifierPressed || event.button !== 0 ) {
			return false;
		}
		const pos = view.posAtCoords( {
			x: event.clientX,
			y: event.clientY,
		} );
		if ( pos === null ) {
			return false;
		}
		const url = urlAtPos( view, pos );
		if ( ! url ) {
			return false;
		}
		event.preventDefault();
		event.stopPropagation();
		void window.api.shell.openExternal( url );
		return true;
	},
} );
