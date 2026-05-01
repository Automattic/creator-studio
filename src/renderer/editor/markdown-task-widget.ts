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

class TaskCheckboxWidget extends WidgetType {
	constructor(
		readonly checked: boolean,
		readonly from: number
	) {
		super();
	}
	eq( other: TaskCheckboxWidget ): boolean {
		return other.checked === this.checked && other.from === this.from;
	}
	toDOM( view: EditorView ): HTMLElement {
		const wrap = document.createElement( 'span' );
		wrap.className = 'cm-task-checkbox';
		wrap.contentEditable = 'false';
		const input = document.createElement( 'input' );
		input.type = 'checkbox';
		input.checked = this.checked;
		// Toggle the state by dispatching a doc change. We rewrite only the
		// single character inside the brackets so we don't fight the cursor
		// or other decorations on the line.
		input.addEventListener( 'click', ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			const next = ! this.checked;
			view.dispatch( {
				changes: {
					from: this.from + 1,
					to: this.from + 2,
					insert: next ? 'x' : ' ',
				},
			} );
		} );
		wrap.appendChild( input );
		return wrap;
	}
	ignoreEvent(): boolean {
		// Let the checkbox handle its own click; CodeMirror should not
		// translate that click into a cursor move that would expand the line.
		return true;
	}
}

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
	const ranges: Array< { from: number; to: number; deco: Decoration } > = [];
	for ( const { from, to } of view.visibleRanges ) {
		syntaxTree( view.state ).iterate( {
			from,
			to,
			enter: ( node ) => {
				if ( node.name !== 'TaskMarker' ) {
					return;
				}
				const line = view.state.doc.lineAt( node.from );
				if ( lineActive( view, line.from, line.to ) ) {
					return;
				}
				// TaskMarker spans `[ ]` or `[x]` (3 chars). Read the middle
				// char to decide checked state. Swallow the trailing space
				// so the visible text starts cleanly after the checkbox.
				const middle = view.state.doc.sliceString(
					node.from + 1,
					node.from + 2
				);
				const checked = middle === 'x' || middle === 'X';
				const docLen = view.state.doc.length;
				const trailingSpace =
					node.to < docLen &&
					view.state.doc.sliceString( node.to, node.to + 1 ) === ' '
						? 1
						: 0;
				ranges.push( {
					from: node.from,
					to: node.to + trailingSpace,
					deco: Decoration.replace( {
						widget: new TaskCheckboxWidget( checked, node.from ),
					} ),
				} );
			},
		} );
	}
	const builder = new RangeSetBuilder< Decoration >();
	ranges.sort( ( a, b ) => a.from - b.from );
	for ( const r of ranges ) {
		builder.add( r.from, r.to, r.deco );
	}
	return builder.finish();
}

export const markdownTaskWidget = ViewPlugin.fromClass(
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
