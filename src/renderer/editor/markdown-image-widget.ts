import { syntaxTree } from '@codemirror/language';
import { Facet, RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view';

// Provided once per editor mount so the widget can build the project-bound
// `studio-asset://` URLs without threading projectId through the syntax-tree
// walk on every update.
export const projectIdFacet = Facet.define< string, string >( {
	combine: ( values ) => ( values.length ? values[ 0 ] : '' ),
} );

class ImageWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly alt: string
	) {
		super();
	}
	eq( other: ImageWidget ): boolean {
		return other.src === this.src && other.alt === this.alt;
	}
	toDOM(): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'cm-image-widget';
		wrap.contentEditable = 'false';
		const img = document.createElement( 'img' );
		img.src = this.src;
		img.alt = this.alt;
		img.draggable = false;
		img.onerror = () => wrap.classList.add( 'cm-image-widget-error' );
		wrap.appendChild( img );
		return wrap;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

// Rewrites relative paths to studio-asset://. Absolute URLs pass through.
// `file://` and OS-absolute paths are blocked — the only legal local source
// is via the project root (the protocol handler enforces in-project bounds).
function resolveImageSrc( raw: string, projectId: string ): string | null {
	const trimmed = raw.trim();
	if ( ! trimmed ) {
		return null;
	}
	if ( /^(https?:|data:|blob:|studio-asset:)/i.test( trimmed ) ) {
		return trimmed;
	}
	if ( /^file:|^\/|^[a-z]:[\\/]/i.test( trimmed ) ) {
		return null;
	}
	if ( ! projectId ) {
		return null;
	}
	// Drafts live at <project>/drafts/<relPath>. Anchor the URL there so a
	// markdown reference like `assets/foo.png` maps to
	// <project>/drafts/assets/foo.png (legacy in-drafts asset layout) and a
	// `../sources/assets/foo.png` reference (current layout) walks up out of
	// drafts/. The studio-asset protocol handler normalizes `..` via
	// path.resolve and rejects anything that escapes the project root.
	const segments = trimmed
		.split( '/' )
		.map( ( s ) => encodeURIComponent( s ) );
	return `studio-asset://${ projectId }/drafts/${ segments.join( '/' ) }`;
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
	const projectId = view.state.facet( projectIdFacet );
	const widgetRanges: Array< {
		from: number;
		to: number;
		deco: Decoration;
	} > = [];
	for ( const { from, to } of view.visibleRanges ) {
		syntaxTree( view.state ).iterate( {
			from,
			to,
			enter: ( node ) => {
				if ( node.name !== 'Image' ) {
					return;
				}
				const line = view.state.doc.lineAt( node.from );
				if ( lineActive( view, line.from, line.to ) ) {
					return;
				}
				// Walk children to extract alt and url. Lezer emits:
				// LinkMark "![", inner inline (alt), LinkMark "]",
				// LinkMark "(", URL, optional title, LinkMark ")".
				let alt = '';
				let url = '';
				const cursor = node.node.cursor();
				if ( cursor.firstChild() ) {
					do {
						if ( cursor.name === 'URL' ) {
							url = view.state.doc.sliceString(
								cursor.from,
								cursor.to
							);
						}
					} while ( cursor.nextSibling() );
				}
				if ( ! alt ) {
					// Alt = everything between the second and third LinkMark
					// siblings of the Image node, but extracting that exactly
					// is fiddly; for now use the raw `![alt](url)` text and
					// strip the syntax. Good enough for v1.
					const raw = view.state.doc.sliceString(
						node.from,
						node.to
					);
					const altMatch = raw.match( /^!\[([^\]]*)\]/ );
					alt = altMatch ? altMatch[ 1 ] : '';
				}
				const src = resolveImageSrc( url, projectId );
				if ( ! src ) {
					return;
				}
				widgetRanges.push( {
					from: node.from,
					to: node.to,
					deco: Decoration.replace( {
						widget: new ImageWidget( src, alt ),
						block: false,
					} ),
				} );
			},
		} );
	}
	const builder = new RangeSetBuilder< Decoration >();
	widgetRanges.sort( ( a, b ) => a.from - b.from );
	for ( const r of widgetRanges ) {
		builder.add( r.from, r.to, r.deco );
	}
	return builder.finish();
}

export const markdownImageWidget = ViewPlugin.fromClass(
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
