import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';

// Lezer markdown node names whose presence is purely syntactic — when the
// cursor is on a different line we hide them and let CSS classes
// (.cm-strong, .cm-emphasis, .cm-header-N) do the visual rendering.
// Lezer's `URL` node is the (url) part of an inline link `[text](url)`.
// Naked URLs in prose are emitted as `Autolink`, not `URL`, so this only
// hits the parenthesized link target — exactly what we want to hide
// alongside the surrounding `[`/`]`/`(`/`)` LinkMarks.
const HIDE_MARK_NODES = new Set( [
	'HeaderMark',
	'EmphasisMark',
	'LinkMark',
	'CodeMark',
	'URL',
] );

const hideDecoration = Decoration.replace( {} );

function lineActive(
	view: EditorView,
	lineFrom: number,
	lineTo: number
): boolean {
	for ( const range of view.state.selection.ranges ) {
		if ( range.from <= lineTo && range.to >= lineFrom ) {
			return true;
		}
	}
	return false;
}

function buildDecorations( view: EditorView ): DecorationSet {
	const builder = new RangeSetBuilder< Decoration >();
	for ( const { from, to } of view.visibleRanges ) {
		syntaxTree( view.state ).iterate( {
			from,
			to,
			enter: ( node ) => {
				if ( ! HIDE_MARK_NODES.has( node.name ) ) {
					return;
				}
				const line = view.state.doc.lineAt( node.from );
				if ( lineActive( view, line.from, line.to ) ) {
					return;
				}
				// HeaderMark covers just the `#` characters; absorb the
				// single trailing space too so the heading text starts at
				// the line edge instead of indented by one space.
				const isHeader = node.name === 'HeaderMark';
				const docLen = view.state.doc.length;
				const trailingSpace =
					isHeader &&
					node.to < docLen &&
					view.state.doc.sliceString( node.to, node.to + 1 ) === ' '
						? 1
						: 0;
				builder.add(
					node.from,
					node.to + trailingSpace,
					hideDecoration
				);
			},
		} );
	}
	return builder.finish();
}

export const markdownLiveDecorations = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor( view: EditorView ) {
			this.decorations = buildDecorations( view );
		}
		update( update: ViewUpdate ): void {
			if (
				update.docChanged ||
				update.selectionSet ||
				update.viewportChanged
			) {
				this.decorations = buildDecorations( update.view );
			}
		}
	},
	{
		decorations: ( v ) => v.decorations,
	}
);
