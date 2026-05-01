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

// `defaultHighlightStyle` ships scoped IDs (e.g. `ͼ7`) for heading tags,
// so we can't target heading levels via class selectors in CSS. Apply a
// stable `cm-h<n>` line class ourselves while we're already walking the
// tree; CSS gets to do the size/weight/spacing.
const headingLineClass: Record< string, Decoration > = {
	ATXHeading1: Decoration.line( { attributes: { class: 'cm-h1' } } ),
	ATXHeading2: Decoration.line( { attributes: { class: 'cm-h2' } } ),
	ATXHeading3: Decoration.line( { attributes: { class: 'cm-h3' } } ),
	ATXHeading4: Decoration.line( { attributes: { class: 'cm-h4' } } ),
	ATXHeading5: Decoration.line( { attributes: { class: 'cm-h5' } } ),
	ATXHeading6: Decoration.line( { attributes: { class: 'cm-h6' } } ),
};

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
	// Two passes so line decorations and replace decorations stay sorted
	// independently — RangeSetBuilder requires strictly ascending starts
	// per pass, but the syntax tree visits HeaderMark inside ATXHeading,
	// which would interleave the two kinds.
	const lineRanges: Array< { from: number; deco: Decoration } > = [];
	const replaceRanges: Array< {
		from: number;
		to: number;
		deco: Decoration;
	} > = [];
	for ( const { from, to } of view.visibleRanges ) {
		syntaxTree( view.state ).iterate( {
			from,
			to,
			enter: ( node ) => {
				const headingDeco = headingLineClass[ node.name ];
				if ( headingDeco ) {
					const line = view.state.doc.lineAt( node.from );
					lineRanges.push( {
						from: line.from,
						deco: headingDeco,
					} );
					return;
				}
				if ( ! HIDE_MARK_NODES.has( node.name ) ) {
					return;
				}
				const line = view.state.doc.lineAt( node.from );
				if ( lineActive( view, line.from, line.to ) ) {
					return;
				}
				const isHeader = node.name === 'HeaderMark';
				const docLen = view.state.doc.length;
				const trailingSpace =
					isHeader &&
					node.to < docLen &&
					view.state.doc.sliceString( node.to, node.to + 1 ) === ' '
						? 1
						: 0;
				replaceRanges.push( {
					from: node.from,
					to: node.to + trailingSpace,
					deco: hideDecoration,
				} );
			},
		} );
	}
	const builder = new RangeSetBuilder< Decoration >();
	const all: Array< {
		from: number;
		to: number;
		deco: Decoration;
		line: boolean;
	} > = [];
	for ( const r of lineRanges ) {
		all.push( { from: r.from, to: r.from, deco: r.deco, line: true } );
	}
	for ( const r of replaceRanges ) {
		all.push( { from: r.from, to: r.to, deco: r.deco, line: false } );
	}
	all.sort(
		( a, b ) => a.from - b.from || ( a.line ? -1 : 1 ) - ( b.line ? -1 : 1 )
	);
	for ( const r of all ) {
		builder.add( r.from, r.to, r.deco );
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
