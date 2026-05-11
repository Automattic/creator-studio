import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorView, ViewUpdate } from '@codemirror/view';

import type { MessageSelection } from '../../types';
import { computeAnchorPosition } from './coords';
import type { SelectionMenuPosition } from './SelectionMenu';

export type EditorSelectionInfo = MessageSelection & {
	words: number;
	chars: number;
};

type Ref< T > = {
	readonly current: T | null;
};

type UseSelectionMenuOptions = {
	resourcePath: string;
	viewRef: Ref< EditorView >;
	scrollRef: Ref< HTMLElement >;
	onAddSelection: ( selection: MessageSelection ) => void;
	onOpenChat?: () => void;
};

// Words = locale-aware word boundaries; chars = code points (visual chars).
export function countWords( text: string ): number {
	const matches = text.match( /\b[\p{L}\p{N}'-]+\b/gu );
	return matches ? matches.length : 0;
}

export function countChars( text: string ): number {
	// Array.from handles multi-codepoint glyphs (emoji, accents) better than .length.
	return Array.from( text ).length;
}

const SELECTION_MENU_WIDTH = 168;

function computeSelectionMenuPosition(
	view: EditorView,
	scroller: HTMLElement | null,
	from: number
): SelectionMenuPosition | null {
	return computeAnchorPosition( view, scroller, from, {
		width: SELECTION_MENU_WIDTH,
	} );
}

function selectionId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `s-${ Date.now() }-${ Math.random().toString( 36 ).slice( 2, 8 ) }`;
}

export function withSelectionId< T extends MessageSelection >(
	selection: T
): T & { id: string } {
	return { id: selectionId(), ...selection };
}

export function useSelectionMenu( {
	resourcePath,
	viewRef,
	scrollRef,
	onAddSelection,
	onOpenChat,
}: UseSelectionMenuOptions ): {
	selectionInfo: EditorSelectionInfo | null;
	selectionMenu: {
		open: boolean;
		position: SelectionMenuPosition | null;
	};
	handleEditorFocus: () => false;
	handleEditorBlur: () => false;
	handleSelectionUpdate: ( update: ViewUpdate ) => void;
	handleAddToChat: () => void;
	handleChat: () => void;
} {
	const [ selectionInfo, setSelectionInfo ] =
		useState< EditorSelectionInfo | null >( null );
	const [ selectionMenu, setSelectionMenu ] = useState< {
		open: boolean;
		position: SelectionMenuPosition | null;
	} >( { open: false, position: null } );
	// The chat panel and other sidebar consumers want the last non-empty
	// selection to stay pinned while the user interacts outside the editor.
	const editorFocusedRef = useRef< boolean >( false );

	useEffect( () => {
		setSelectionInfo( null );
		setSelectionMenu( { open: false, position: null } );
	}, [ resourcePath ] );

	const handleEditorFocus = useCallback( (): false => {
		editorFocusedRef.current = true;
		return false;
	}, [] );

	const handleEditorBlur = useCallback( (): false => {
		editorFocusedRef.current = false;
		return false;
	}, [] );

	const handleSelectionUpdate = useCallback(
		( update: ViewUpdate ): void => {
			if ( ! ( update.selectionSet || update.docChanged ) ) {
				return;
			}
			const range = update.state.selection.main;
			if ( range.empty ) {
				if ( editorFocusedRef.current ) {
					setSelectionInfo( null );
					setSelectionMenu( { open: false, position: null } );
				}
				return;
			}

			const text = update.state.doc.sliceString( range.from, range.to );
			const fromLine = update.state.doc.lineAt( range.from ).number;
			const toLine = update.state.doc.lineAt( range.to ).number;
			setSelectionInfo( {
				resourcePath,
				words: countWords( text ),
				chars: countChars( text ),
				text,
				fromLine,
				toLine,
			} );
			const pos = computeSelectionMenuPosition(
				update.view,
				scrollRef.current,
				range.from
			);
			setSelectionMenu(
				pos
					? { open: true, position: pos }
					: { open: false, position: null }
			);
		},
		[ resourcePath, scrollRef ]
	);

	const handleAddToChat = useCallback( (): void => {
		const sel = selectionInfo;
		if ( ! sel ) {
			return;
		}
		onAddSelection( {
			resourcePath: sel.resourcePath,
			text: sel.text,
			fromLine: sel.fromLine,
			toLine: sel.toLine,
		} );
		const view = viewRef.current;
		if ( view ) {
			const range = view.state.selection.main;
			if ( ! range.empty ) {
				view.dispatch( { selection: { anchor: range.from } } );
			}
		}
	}, [ onAddSelection, selectionInfo, viewRef ] );

	const handleChat = useCallback( (): void => {
		onOpenChat?.();
		handleAddToChat();
	}, [ handleAddToChat, onOpenChat ] );

	return {
		selectionInfo,
		selectionMenu,
		handleEditorFocus,
		handleEditorBlur,
		handleSelectionUpdate,
		handleAddToChat,
		handleChat,
	};
}
