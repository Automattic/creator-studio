import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view';

class PlaceholderWidget extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		const span = document.createElement( 'span' );
		span.className = 'cm-empty-line-placeholder';
		span.setAttribute( 'aria-hidden', 'true' );
		span.append( 'Press ' );
		const kbd = document.createElement( 'kbd' );
		kbd.textContent = '/';
		span.appendChild( kbd );
		span.append( ' for commands' );
		return span;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

// Show the hint only on the line that contains the main cursor and only when
// that line has no characters at all. Anywhere else (selection, non-empty
// line, multi-cursor) the hint stays hidden — it'd be visual noise otherwise.
function buildDecorations( view: EditorView ): DecorationSet {
	const main = view.state.selection.main;
	if ( ! main.empty ) {
		return Decoration.none;
	}
	const line = view.state.doc.lineAt( main.from );
	if ( line.text !== '' ) {
		return Decoration.none;
	}
	const builder = new RangeSetBuilder< Decoration >();
	builder.add(
		line.from,
		line.from,
		Decoration.widget( {
			widget: new PlaceholderWidget(),
			// side: 1 paints the widget after the cursor at this position so
			// the caret renders at the line edge with the hint trailing.
			side: 1,
		} )
	);
	return builder.finish();
}

export const emptyLinePlaceholder = ViewPlugin.fromClass(
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
	{ decorations: ( v ) => v.decorations }
);
