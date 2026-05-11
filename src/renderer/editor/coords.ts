import type { EditorView } from '@codemirror/view';

export type AnchorPosition = { top: number; left: number };

// Vertical coord for `pos` (from CM6) plus a left edge inside the scroll
// container, gutter-padded from the right. Used by both the selection
// menu and the check-issue popover so they sit in the same column.
const RIGHT_GUTTER = 16;

export function computeAnchorPosition(
	view: EditorView,
	scroller: HTMLElement | null,
	pos: number,
	{ width }: { width: number }
): AnchorPosition | null {
	if ( ! scroller ) {
		return null;
	}
	const rect = view.coordsAtPos( pos );
	if ( ! rect ) {
		return null;
	}
	const scrollRect = scroller.getBoundingClientRect();
	return {
		top: rect.top,
		left: scrollRect.right - width - RIGHT_GUTTER,
	};
}
