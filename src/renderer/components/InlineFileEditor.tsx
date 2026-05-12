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

import { slugifyTitle } from '../../main/channels/utils/slugify';
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
	// Fired when the title input triggers an auto-rename. The parent updates
	// the previewed-file pointer so the next render targets the renamed
	// file. Only relevant for `folder === 'sources'` markdown — the title
	// input renders for that combination only.
	onRelPathChanged?: ( newRelPath: string ) => void;
};

const noopAddSelection = (): void => {};

// Inline editor for markdown / plain text resource previews. Loads the file
// once on mount, persists edits via `useAutoSave`, and writes back through
// `notes.write` (markdown drafts/done/sources — preserves frontmatter +
// title) or `project.writeFile` (everything else — raw bytes).
//
// Lighter than `DraftEditorScreen`: no AI/slash menus, no image insertion,
// no file watching. For source markdown we also render a title input above
// the body and auto-rename the file from the title's slug (mirrors the
// draft editor's behaviour). Drafts/done previews stay title-less — the
// dedicated `DraftEditorScreen` owns that surface.
export function InlineFileEditor( {
	projectId,
	folder,
	relPath,
	name,
	selectionMenuMode = 'idle',
	onAddSelection,
	onOpenSelectionChat,
	onRelPathChanged,
}: Props ): React.ReactElement {
	const isMd = isMarkdown( name );
	const useNotesIpc =
		isMd &&
		( folder === 'drafts' || folder === 'done' || folder === 'sources' );
	const showTitleInput = isMd && folder === 'sources';
	const selectionEnabled = !! onAddSelection;
	const resourcePath = `${ folder }/${ relPath }`;

	const [ load, setLoad ] = useState< LoadState >( { status: 'loading' } );
	const [ body, setBody ] = useState< string >( '' );
	// Title input (source markdown only). Synced with `titleRef` so the
	// next body autosave picks up the latest value via `notes.write`.
	const [ titleInput, setTitleInput ] = useState< string >( '' );
	const hostRef = useRef< HTMLDivElement | null >( null );
	const viewRef = useRef< EditorView | null >( null );
	const scrollRef = useRef< HTMLElement | null >( null );
	const titleInputRef = useRef< HTMLInputElement | null >( null );
	// Captured at load time and refreshed on each successful save so the next
	// write satisfies the mtime conflict guard. For draft IPC we also need the
	// title + non-title frontmatter to round-trip on save.
	const mtimeRef = useRef< number | null >( null );
	const titleRef = useRef< string >( '' );
	const frontmatterRef = useRef< Record< string, unknown > >( {} );
	// Tracks the slug we last attempted to rename to. Without it, a blur →
	// rename round-trip whose result re-fires the blur handler (because the
	// title input loses focus when the preview key changes) could loop.
	const lastAutoRenameSlugRef = useRef< string | null >( null );
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
				if ( useNotesIpc ) {
					const res =
						folder === 'sources'
							? await window.api.sources.read(
									projectId,
									relPath
							  )
							: await window.api.drafts.read(
									projectId,
									relPath,
									{
										folder:
											folder === 'done'
												? 'done'
												: 'drafts',
									}
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
					// For source markdown the title is editable here. Seed
					// the input from frontmatter unless the on-disk title is
					// just the fallback basename (`untitled`, `untitled-2`),
					// which we treat as "no title yet" so the placeholder
					// reads "Note title…" instead of pre-filling "Untitled".
					if ( showTitleInput ) {
						const fallback =
							res.title === 'Untitled' ||
							res.title === relPath.replace( /\.md$/i, '' );
						setTitleInput( fallback ? '' : res.title );
						lastAutoRenameSlugRef.current = null;
					}
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
	}, [ projectId, folder, relPath, useNotesIpc, showTitleInput ] );

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
			if ( useNotesIpc ) {
				const result =
					folder === 'sources'
						? await window.api.sources.write( projectId, relPath, {
								title: titleRef.current,
								body: text,
								frontmatter: frontmatterRef.current,
								expectedMtime: mtimeRef.current,
						  } )
						: await window.api.drafts.write( projectId, relPath, {
								title: titleRef.current,
								body: text,
								frontmatter: frontmatterRef.current,
								expectedMtime: mtimeRef.current,
								folder: folder === 'done' ? 'done' : 'drafts',
						  } );
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
		[ projectId, folder, relPath, useNotesIpc ]
	);

	const { state: saveState } = useAutoSave< string >( {
		value: body,
		enabled: load.status === 'ready',
		save,
	} );

	// Auto-rename from the title input. Fires on blur and Enter unless the
	// user pinned the filename via explicit rename (frontmatter
	// `autoRename: false`). Mirrors the helper in DraftEditorScreen so
	// source notes behave identically to drafts.
	const maybeAutoRenameRef = useRef< () => Promise< void > >(
		async () => {}
	);
	useEffect( () => {
		maybeAutoRenameRef.current = async () => {
			if ( ! showTitleInput ) {
				return;
			}
			if ( load.status !== 'ready' ) {
				return;
			}
			if ( frontmatterRef.current.autoRename === false ) {
				return;
			}
			const slug = slugifyTitle( titleInput );
			if ( ! slug ) {
				return;
			}
			const currentBasename = relPath.replace( /\.md$/i, '' );
			if ( slug === currentBasename ) {
				return;
			}
			if ( lastAutoRenameSlugRef.current === slug ) {
				return;
			}
			lastAutoRenameSlugRef.current = slug;
			// Persist title (and current body) before rename so the moved
			// file already carries the new frontmatter title. `flush()`
			// short-circuits when the body hasn't changed, so we call
			// `save` directly to guarantee a write that picks up
			// `titleRef.current`.
			await save( body );
			const result = await window.api.sources.rename(
				projectId,
				relPath,
				titleInput,
				{ markManual: false }
			);
			if ( ! result.ok ) {
				lastAutoRenameSlugRef.current = null;
				// eslint-disable-next-line no-console
				console.error(
					'note auto-rename failed',
					'reason' in result ? result.reason : 'unknown'
				);
				return;
			}
			mtimeRef.current = result.mtime;
			onRelPathChanged?.( result.relPath );
		};
	}, [
		showTitleInput,
		load.status,
		titleInput,
		projectId,
		relPath,
		body,
		save,
		onRelPathChanged,
	] );

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
			{ showTitleInput && (
				<input
					ref={ titleInputRef }
					type="text"
					className="resource-preview-editor-title"
					data-testid="note-editor-title-input"
					aria-label="Note title"
					placeholder="Note title…"
					value={ titleInput }
					onChange={ ( e ) => {
						setTitleInput( e.target.value );
						titleRef.current = e.target.value;
					} }
					onBlur={ () => {
						void maybeAutoRenameRef.current();
					} }
					onKeyDown={ ( e ) => {
						const moveToBody = (): void => {
							e.preventDefault();
							const view = viewRef.current;
							if ( ! view ) {
								return;
							}
							view.focus();
							view.dispatch( {
								selection: { anchor: 0 },
							} );
						};
						if ( e.key === 'Enter' || e.key === 'ArrowDown' ) {
							moveToBody();
							return;
						}
						if (
							e.key === 'ArrowRight' &&
							e.currentTarget.selectionStart ===
								e.currentTarget.value.length &&
							e.currentTarget.selectionEnd ===
								e.currentTarget.value.length
						) {
							moveToBody();
						}
					} }
				/>
			) }
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
