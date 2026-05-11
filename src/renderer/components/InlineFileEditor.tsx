import React, { useCallback, useEffect, useRef, useState } from 'react';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
	markdown,
	markdownKeymap,
	markdownLanguage,
} from '@codemirror/lang-markdown';
import {
	bracketMatching,
	defaultHighlightStyle,
	indentUnit,
	syntaxHighlighting,
} from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
	drawSelection,
	dropCursor,
	EditorView,
	keymap,
} from '@codemirror/view';

import type { MessageSelection } from '../../types';
import {
	markdownImageWidget,
	projectIdFacet,
} from '../editor/markdown-image-widget';
import { markdownLinkClick } from '../editor/markdown-link-click';
import { markdownLiveDecorations } from '../editor/markdown-live-decorations';
import { markdownTaskWidget } from '../editor/markdown-task-widget';
import { SelectionMenu, type SelectionMenuMode } from '../editor/SelectionMenu';
import { useSelectionMenu } from '../editor/useSelectionMenu';
import { useAutoSave } from '../hooks/useAutoSave';
import { isMarkdown } from '../lib/previewKind';

type Folder = 'sources' | 'drafts' | 'done';

type LoadState =
	| { status: 'loading' }
	| { status: 'ready'; text: string }
	| { status: 'too-large' }
	| { status: 'error' };

type Props = {
	projectId: string;
	folder: Folder;
	relPath: string;
	name: string;
	selectionMenuMode?: SelectionMenuMode;
	onAddSelection?: ( selection: MessageSelection ) => void;
	onOpenSelectionChat?: () => void;
};

const noopAddSelection = (): void => {};

// Inline editor for markdown / plain text resource previews. Loads the file
// once on mount, persists edits via `useAutoSave`, and writes back through
// `drafts.write` (markdown drafts/done — preserves frontmatter + title) or
// `project.writeFile` (everything else — raw bytes).
//
// Intentionally lighter than `DraftEditorScreen`: no title input, no AI/slash
// menus, no image insertion, no autorename, no file watching. The full draft
// editor remains the place for those features; clicking "Edit" on a draft
// preview hands off to it.
export function InlineFileEditor( {
	projectId,
	folder,
	relPath,
	name,
	selectionMenuMode = 'idle',
	onAddSelection,
	onOpenSelectionChat,
}: Props ): React.ReactElement {
	const isMd = isMarkdown( name );
	const useDraftIpc = isMd && ( folder === 'drafts' || folder === 'done' );
	const selectionEnabled = !! onAddSelection;
	const resourcePath = `${ folder }/${ relPath }`;

	const [ load, setLoad ] = useState< LoadState >( { status: 'loading' } );
	const [ body, setBody ] = useState< string >( '' );
	const hostRef = useRef< HTMLDivElement | null >( null );
	const viewRef = useRef< EditorView | null >( null );
	const scrollRef = useRef< HTMLElement | null >( null );
	// Captured at load time and refreshed on each successful save so the next
	// write satisfies the mtime conflict guard. For draft IPC we also need the
	// title + non-title frontmatter to round-trip on save.
	const mtimeRef = useRef< number | null >( null );
	const titleRef = useRef< string >( '' );
	const frontmatterRef = useRef< Record< string, unknown > >( {} );
	const {
		selectionMenu,
		handleEditorFocus,
		handleEditorBlur,
		handleSelectionUpdate,
		handleAddToChat,
		handleChat,
	} = useSelectionMenu( {
		resourcePath,
		viewRef,
		scrollRef,
		onAddSelection: onAddSelection ?? noopAddSelection,
		onOpenChat: onOpenSelectionChat,
	} );

	useEffect( () => {
		let cancelled = false;
		setLoad( { status: 'loading' } );
		void ( async () => {
			try {
				if ( useDraftIpc ) {
					const res = await window.api.drafts.read(
						projectId,
						relPath,
						{ folder: folder === 'done' ? 'done' : 'drafts' }
					);
					if ( cancelled ) {
						return;
					}
					if ( ! res ) {
						setLoad( { status: 'error' } );
						return;
					}
					titleRef.current = res.title;
					frontmatterRef.current = res.frontmatter;
					mtimeRef.current = res.mtime;
					setBody( res.body );
					setLoad( { status: 'ready', text: res.body } );
					return;
				}
				const res = await window.api.project.readFile(
					projectId,
					`${ folder }/${ relPath }`
				);
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setLoad( { status: 'error' } );
					return;
				}
				if ( res.tooLarge ) {
					setLoad( { status: 'too-large' } );
					return;
				}
				mtimeRef.current = res.mtime;
				setBody( res.text );
				setLoad( { status: 'ready', text: res.text } );
			} catch {
				if ( cancelled ) {
					return;
				}
				setLoad( { status: 'error' } );
			}
		} )();
		return () => {
			cancelled = true;
		};
	}, [ projectId, folder, relPath, useDraftIpc ] );

	// Mount the editor once the load completes. Re-runs on file identity
	// changes (the load effect resets to `loading` first, tearing the view
	// down via cleanup, and the next 'ready' rebuilds it with fresh content).
	useEffect( () => {
		if ( load.status !== 'ready' || ! hostRef.current ) {
			return;
		}
		scrollRef.current =
			( hostRef.current.closest(
				'[data-testid=resources-list]'
			) as HTMLElement | null ) ?? hostRef.current;
		const baseExtensions = [
			history(),
			indentUnit.of( '\t' ),
			closeBrackets(),
			drawSelection(),
			dropCursor(),
			search( { top: true } ),
			EditorView.lineWrapping,
			EditorView.contentAttributes.of( { spellcheck: 'true' } ),
			...( selectionEnabled
				? [
						EditorView.domEventHandlers( {
							focus: handleEditorFocus,
							blur: handleEditorBlur,
						} ),
				  ]
				: [] ),
			EditorView.updateListener.of( ( u ) => {
				if ( u.docChanged ) {
					setBody( u.state.doc.toString() );
				}
				if ( selectionEnabled ) {
					handleSelectionUpdate( u );
				}
			} ),
			keymap.of( [
				...closeBracketsKeymap,
				...searchKeymap,
				...( isMd ? markdownKeymap : [] ),
				...defaultKeymap,
				...historyKeymap,
			] ),
		];
		const markdownExtensions = isMd
			? [
					projectIdFacet.of( projectId ),
					// markdownLanguage = GFM (task lists, tables, strikethrough,
					// autolinks). Mirrors the draft editor's language config.
					markdown( { base: markdownLanguage } ),
					syntaxHighlighting( defaultHighlightStyle ),
					markdownLiveDecorations,
					markdownTaskWidget,
					markdownImageWidget,
					markdownLinkClick,
					bracketMatching(),
			  ]
			: [];
		const view = new EditorView( {
			parent: hostRef.current,
			state: EditorState.create( {
				doc: load.text,
				extensions: [ ...baseExtensions, ...markdownExtensions ],
			} ),
		} );
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
			scrollRef.current = null;
		};
		// Mount once per ready load; doc edits flow through the updateListener.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ load.status === 'ready' ] );

	const save = useCallback(
		async ( text: string ): Promise< 'ok' | 'error' > => {
			if ( useDraftIpc ) {
				const result = await window.api.drafts.write(
					projectId,
					relPath,
					{
						title: titleRef.current,
						body: text,
						frontmatter: frontmatterRef.current,
						expectedMtime: mtimeRef.current,
						folder: folder === 'done' ? 'done' : 'drafts',
					}
				);
				if ( result.ok ) {
					mtimeRef.current = result.mtime;
					return 'ok';
				}
				return 'error';
			}
			const result = await window.api.project.writeFile(
				projectId,
				folder,
				relPath,
				{
					contents: text,
					expectedMtime: mtimeRef.current,
				}
			);
			if ( result.ok ) {
				mtimeRef.current = result.mtime;
				return 'ok';
			}
			return 'error';
		},
		[ projectId, folder, relPath, useDraftIpc ]
	);

	const { state: saveState } = useAutoSave< string >( {
		value: body,
		enabled: load.status === 'ready',
		save,
	} );

	if ( load.status === 'loading' ) {
		return <div className="resources-grid-hint">Loading…</div>;
	}
	if ( load.status === 'error' ) {
		return (
			<div className="resources-grid-hint">
				Couldn&apos;t read this file
			</div>
		);
	}
	if ( load.status === 'too-large' ) {
		return (
			<div className="resources-grid-hint">
				This file is too large to edit in place
			</div>
		);
	}

	return (
		<div
			className="resource-preview-editor"
			data-testid="resource-preview-editor"
			data-kind={ isMd ? 'markdown' : 'text' }
			data-state={ saveState }
		>
			<div
				ref={ hostRef }
				className="draft-editor-host resource-preview-editor-host"
				data-status="ready"
			/>
			{ selectionEnabled && (
				<SelectionMenu
					open={ selectionMenu.open }
					position={ selectionMenu.position }
					mode={ selectionMenuMode }
					onAddToChat={ handleAddToChat }
					onChat={ handleChat }
				/>
			) }
		</div>
	);
}
