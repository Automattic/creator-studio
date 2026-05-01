import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
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
	'QuoteMark',
	'URL',
] );

// Marks whose trailing space should also be swallowed when hidden, so the
// visible text starts at the line edge instead of indented by the marker
// space (e.g. `# Heading` reads as `Heading`, not ` Heading`).
const SWALLOW_TRAILING_SPACE = new Set( [ 'HeaderMark', 'QuoteMark' ] );

// Line-level marks describe the whole line (heading, blockquote). They use
// the line-active rule: cursor anywhere on the line keeps the marks shown.
const LINE_LEVEL_MARKS = new Set( [ 'HeaderMark', 'QuoteMark' ] );

// Inline marks describe a sub-range of the line. They use the node-active
// rule: marks stay shown only while the selection touches the parent
// formatting span. The map gives the names of the parent nodes to look
// for when walking the syntax tree upward from a hit mark.
const INLINE_PARENTS: Record< string, readonly string[] > = {
	EmphasisMark: [ 'Emphasis', 'StrongEmphasis' ],
	LinkMark: [ 'Link', 'Image' ],
	CodeMark: [ 'InlineCode', 'FencedCode' ],
	URL: [ 'Link', 'Image' ],
};

const blockquoteLine = Decoration.line( {
	attributes: { class: 'cm-blockquote-line' },
} );

const fencedCodeLine = Decoration.line( {
	attributes: { class: 'cm-fenced-line' },
} );

// Bullet `-`, `+`, `*` markers on unordered list items. We replace them with
// a real bullet glyph when the cursor is off the line. Numbered list markers
// (`1.`, `2.`) keep their digits visible so the ordering stays apparent.
class BulletWidget extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		const span = document.createElement( 'span' );
		span.className = 'cm-bullet';
		span.setAttribute( 'aria-hidden', 'true' );
		span.textContent = '•';
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

const bulletDecoration = Decoration.replace( {
	widget: new BulletWidget(),
} );

// `---` / `***` / `___` lines render as a horizontal rule when the cursor
// is off the line; cursor on the line falls back to the raw markdown for
// editing. Implemented as a replace-the-whole-line widget.
class HrWidget extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		const span = document.createElement( 'span' );
		span.className = 'cm-hr-rule';
		span.setAttribute( 'aria-hidden', 'true' );
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

const hrDecoration = Decoration.replace( {
	widget: new HrWidget(),
} );

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
	return selectionTouches( view, lineFrom, lineTo );
}

function selectionTouches(
	view: EditorView,
	from: number,
	to: number
): boolean {
	for ( const range of view.state.selection.ranges ) {
		if ( range.from <= to && range.to >= from ) {
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
				// Blockquote spans multiple lines; tag every contained
				// line so CSS can draw the left bar + indent. Nested
				// blockquotes emit the class twice (the outer Blockquote
				// covers inner lines too), which CodeMirror merges into
				// the same class — visually identical to depth 1, which
				// is acceptable for v1.
				if ( node.name === 'Blockquote' ) {
					const startLine = view.state.doc.lineAt( node.from ).number;
					const endLine = view.state.doc.lineAt( node.to ).number;
					for ( let i = startLine; i <= endLine; i++ ) {
						const l = view.state.doc.line( i );
						lineRanges.push( {
							from: l.from,
							deco: blockquoteLine,
						} );
					}
					return;
				}
				// FencedCode block: tag every contained line so CSS can
				// give the whole block a subtle background + monospace.
				// The first/last lines (the ``` fences) are still tagged
				// so the block reads as a unit, even when the user is on
				// one of those lines editing the language hint.
				if ( node.name === 'FencedCode' ) {
					const startLine = view.state.doc.lineAt( node.from ).number;
					const endLine = view.state.doc.lineAt( node.to ).number;
					for ( let i = startLine; i <= endLine; i++ ) {
						const l = view.state.doc.line( i );
						lineRanges.push( {
							from: l.from,
							deco: fencedCodeLine,
						} );
					}
					return;
				}
				// HorizontalRule (---, ***, ___) renders as an <hr> when
				// the cursor is off the line. Replace the whole node range.
				if ( node.name === 'HorizontalRule' ) {
					const line = view.state.doc.lineAt( node.from );
					if ( lineActive( view, line.from, line.to ) ) {
						return;
					}
					replaceRanges.push( {
						from: node.from,
						to: node.to,
						deco: hrDecoration,
					} );
					return;
				}
				// ListMark is the `-`/`+`/`*`/`1.` of a list item. We only
				// replace the unordered single-character variants — numbered
				// list markers keep their digits so ordering stays visible.
				if ( node.name === 'ListMark' ) {
					const line = view.state.doc.lineAt( node.from );
					if ( lineActive( view, line.from, line.to ) ) {
						return;
					}
					const text = view.state.doc.sliceString(
						node.from,
						node.to
					);
					if ( text !== '-' && text !== '*' && text !== '+' ) {
						return;
					}
					replaceRanges.push( {
						from: node.from,
						to: node.to,
						deco: bulletDecoration,
					} );
					return;
				}
				if ( ! HIDE_MARK_NODES.has( node.name ) ) {
					return;
				}
				if ( LINE_LEVEL_MARKS.has( node.name ) ) {
					// Heading / blockquote — line-active rule.
					const line = view.state.doc.lineAt( node.from );
					if ( lineActive( view, line.from, line.to ) ) {
						return;
					}
				} else {
					// Inline mark (emphasis, link, code, URL) — show only
					// while the selection touches the parent formatting
					// span. Walk up from the mark to find the matching
					// parent node and test against its range.
					const parents = INLINE_PARENTS[ node.name ];
					let parent = node.node.parent;
					while ( parent ) {
						if ( parents && parents.includes( parent.name ) ) {
							if (
								selectionTouches( view, parent.from, parent.to )
							) {
								return;
							}
							break;
						}
						parent = parent.parent;
					}
				}
				const docLen = view.state.doc.length;
				const trailingSpace =
					SWALLOW_TRAILING_SPACE.has( node.name ) &&
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
