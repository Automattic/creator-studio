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
import { escapeLeftToTitle, escapeUpToTitle } from '../editor/markdown-keymap';
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

type Folder = 'sources' | 'drafts' | 'done' | 'checks';

type LoadState =
	| { status: 'loading' }
	| { status: 'ready'; text: string }
	| { status: 'too-large' }
	| { status: 'error' };

// For source markdown the saved value carries both title and body so the
// autosave debounce picks up title-only edits (the helper rename effect
// fires only on blur/Enter). Drafts/done and text fall back to body-only
// because the title isn't editable here.
type Snapshot =
	| { kind: 'body'; body: string }
	| { kind: 'note'; title: string; body: string };

// Keys we'll accept as a clipping URL in frontmatter, in priority order.
// Mirrors `FRONTMATTER_URL_KEYS` in src/main/channels/utils/clipping-thumbs.ts
// so the renderer picks the same URL the main process used for thumbnailing.
const FRONTMATTER_URL_KEYS = [ 'source', 'url', 'link' ] as const;

function readClippingUrl(
	frontmatter: Record< string, unknown >
): string | null {
	for ( const key of FRONTMATTER_URL_KEYS ) {
		const value = frontmatter[ key ];
		if ( typeof value === 'string' && value.trim().length > 0 ) {
			return value.trim();
		}
	}
	return null;
}

function snapshotEq( a: Snapshot, b: Snapshot ): boolean {
	if ( a.kind !== b.kind ) {
		return false;
	}
	if ( a.kind === 'body' && b.kind === 'body' ) {
		return a.body === b.body;
	}
	if ( a.kind === 'note' && b.kind === 'note' ) {
		return a.title === b.title && a.body === b.body;
	}
	return false;
}

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
	// Fired when the human-readable title for this note changes — either on
	// load (from frontmatter) or on every keystroke in the title input. The
	// parent (ResourcePreview) uses it to show the title in the header
	// instead of the filename, falling back to the filename when this
	// resolves to null. Source markdown only.
	onDisplayTitleChange?: ( title: string | null ) => void;
	// Fired once after a source-markdown file loads with the clipping URL
	// pulled from frontmatter (`source` / `url` / `link`, in that order),
	// or `null` if none. ResourcePreview uses it to render a YouTube embed
	// above the editor when the URL resolves to a video. Source markdown
	// only — drafts/done never carry clipping frontmatter.
	onClippingUrlChange?: ( url: string | null ) => void;
};

const noopAddSelection = (): void => {};

// Inline editor for markdown / plain text resource previews. Loads the file
// once on mount, persists edits via `useAutoSave`, and writes back through
// `notes.write` (markdown drafts/done/sources — preserves frontmatter +
// title) or `project.writeFile` (everything else — raw bytes).
//
// Lighter than `DraftEditorScreen`: no AI/slash menus, no image insertion.
// File watching mirrors the draft editor so external edits (agent / terminal)
// reflect within ~50 ms. For source markdown we also render a title input
// above the body and auto-rename the file from the title's slug (mirrors the
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
	onDisplayTitleChange,
	onClippingUrlChange,
}: Props ): React.ReactElement {
	const isMd = isMarkdown( name );
	const useNotesIpc =
		isMd &&
		( folder === 'drafts' || folder === 'done' || folder === 'sources' );
	const useChecksIpc = isMd && folder === 'checks';
	const useMarkdownIpc = useNotesIpc || useChecksIpc;
	// Checks behave like sources: the title is stored in frontmatter and the
	// inline editor exposes it as a separate input above the body. (Auto-
	// rename, however, is sources-only; check filenames stay stable.)
	const showTitleInput =
		isMd && ( folder === 'sources' || folder === 'checks' );
	const selectionEnabled = !! onAddSelection;
	const resourcePath = `${ folder }/${ relPath }`;

	const [ load, setLoad ] = useState< LoadState >( { status: 'loading' } );
	const [ body, setBody ] = useState< string >( '' );
	// Bumped by the file-watcher when the watched file changes on disk
	// (agent / terminal edits). Added to the load-effect deps so a bump
	// re-runs the load and reinitialises the editor with the new content.
	const [ reloadCounter, setReloadCounter ] = useState< number >( 0 );
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
	// Set right before a rename returns from notes:rename — the parent will
	// react by handing us the renamed relPath as a prop, but the on-disk
	// content is unchanged so we don't want the load effect to tear the CM
	// view down (the user may have just moved focus into the body via
	// Enter/ArrowDown). The load effect short-circuits when the new relPath
	// matches this ref.
	const selfRenamedToRef = useRef< string | null >( null );
	// Set in the load effect when we detect a fresh untitled note (the
	// frontmatter literally says `title: Untitled`). The post-load effect
	// below consumes the flag and focuses the title input on the next
	// paint, then clears it. This is what makes "Add note" land the user
	// directly in the title field.
	const shouldFocusTitleRef = useRef< boolean >( false );
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
		// Self-rename: the file's body and frontmatter are already in sync
		// with our refs (we just wrote them). Skip the reload so the CM
		// view stays mounted and the focus the user moved into the body
		// (via Enter / ArrowDown on the title input) sticks.
		if ( selfRenamedToRef.current === relPath ) {
			selfRenamedToRef.current = null;
			return;
		}
		// Same ResourcePreview instance is reused when the user switches
		// between files in the same folder (see ProjectScreen.tsx — the key
		// omits relPath). Clear any clipping URL the previous file surfaced
		// so a stale video doesn't carry over; the success path below will
		// re-set it for source clippings.
		onClippingUrlChange?.( null );
		let cancelled = false;
		setLoad( { status: 'loading' } );
		void ( async () => {
			try {
				if ( useMarkdownIpc ) {
					let res: {
						title: string;
						body: string;
						frontmatter: Record< string, unknown >;
						mtime: number;
					} | null;
					if ( folder === 'sources' ) {
						res = await window.api.sources.read(
							projectId,
							relPath
						);
					} else if ( folder === 'checks' ) {
						res = await window.api.checks.read(
							projectId,
							relPath
						);
					} else {
						res = await window.api.drafts.read(
							projectId,
							relPath,
							{
								folder: folder === 'done' ? 'done' : 'drafts',
							}
						);
					}
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
					// the input from frontmatter — except for the literal
					// "Untitled" sentinel that `notes:create` writes for a
					// fresh note. Treating that as the empty state keeps the
					// placeholder visible so users type a real title without
					// having to clear the pre-filled "Untitled" first.
					//
					// We deliberately do NOT compare title to the basename:
					// a slugified single-word title (e.g. "simple") would
					// equal its filename `simple.md` minus extension and
					// would wrongly read as "fallback" → input cleared.
					if ( showTitleInput ) {
						const fmTitle = frontmatterRef.current.title;
						// Checks are seeded with `Untitled check`; sources
						// with `Untitled`. Either is the empty-state sentinel
						// for the placeholder.
						const isInitialUntitled =
							fmTitle === 'Untitled' ||
							fmTitle === 'Untitled check';
						const initialValue = isInitialUntitled ? '' : res.title;
						setTitleInput( initialValue );
						// Tell the parent so the preview header swaps from
						// filename → title. Null means "no title yet, show
						// the filename" (matches the placeholder state).
						onDisplayTitleChange?.(
							initialValue.length > 0 ? initialValue : null
						);
						// Surface the clipping URL once per load (sources only)
						// so the parent can decide whether to render a video
						// embed above the editor. Keys mirror the main-process
						// FRONTMATTER_URL_KEYS order in clipping-thumbs.ts.
						onClippingUrlChange?.(
							readClippingUrl( frontmatterRef.current )
						);
						lastAutoRenameSlugRef.current = null;
						// Fresh untitled notes land the cursor in the title
						// so the user can name them without an extra click.
						shouldFocusTitleRef.current = isInitialUntitled;
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
	}, [
		projectId,
		folder,
		relPath,
		useMarkdownIpc,
		showTitleInput,
		reloadCounter,
	] );

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
				// ArrowUp on line 1 and ArrowLeft at position 0 escape to the
				// title input — mirrors the draft editor's title↔body wiring.
				// Bindings run before defaultKeymap so they win on boundary
				// positions; they return false elsewhere so CM6 handles the
				// normal cursor movement. Source markdown only — drafts/done
				// inline previews have no title input to escape to.
				...( showTitleInput
					? ( () => {
							const focusTitleAtEnd = (): void => {
								const input = titleInputRef.current;
								if ( ! input ) {
									return;
								}
								input.focus();
								const len = input.value.length;
								try {
									input.setSelectionRange( len, len );
								} catch {
									// type=text never throws — defensive only.
								}
							};
							return [
								{
									key: 'ArrowUp',
									run: escapeUpToTitle( focusTitleAtEnd ),
								},
								{
									key: 'ArrowLeft',
									run: escapeLeftToTitle( focusTitleAtEnd ),
								},
							];
					  } )()
					: [] ),
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

	// Consume the "focus title" hint once the load completes and the input
	// is in the DOM. We do this in a layout effect so the focus shift lands
	// in the same paint as the editor becoming visible.
	useEffect( () => {
		if ( load.status !== 'ready' || ! shouldFocusTitleRef.current ) {
			return;
		}
		shouldFocusTitleRef.current = false;
		titleInputRef.current?.focus();
	}, [ load.status ] );

	const save = useCallback(
		async ( snapshot: Snapshot ): Promise< 'ok' | 'error' > => {
			if ( useMarkdownIpc ) {
				const title =
					snapshot.kind === 'note'
						? snapshot.title
						: titleRef.current;
				let result:
					| { ok: true; mtime: number }
					| { ok: false; reason: string };
				if ( folder === 'sources' ) {
					result = await window.api.sources.write(
						projectId,
						relPath,
						{
							title,
							body: snapshot.body,
							frontmatter: frontmatterRef.current,
							expectedMtime: mtimeRef.current,
						}
					);
				} else if ( folder === 'checks' ) {
					// Checks store `enabled` in frontmatter alongside title.
					// Round-trip the prior value so toggling from elsewhere
					// (the checks panel) survives an editor-driven save.
					const enabled = frontmatterRef.current.enabled === true;
					result = await window.api.checks.write(
						projectId,
						relPath,
						{
							title,
							enabled,
							body: snapshot.body,
							frontmatter: frontmatterRef.current,
							expectedMtime: mtimeRef.current,
						}
					);
				} else {
					result = await window.api.drafts.write(
						projectId,
						relPath,
						{
							title,
							body: snapshot.body,
							frontmatter: frontmatterRef.current,
							expectedMtime: mtimeRef.current,
							folder: folder === 'done' ? 'done' : 'drafts',
						}
					);
				}
				if ( result.ok ) {
					mtimeRef.current = result.mtime;
					return 'ok';
				}
				return 'error';
			}
			const result = await window.api.project.writeFile(
				projectId,
				folder as 'sources' | 'drafts' | 'done',
				relPath,
				{
					contents: snapshot.body,
					expectedMtime: mtimeRef.current,
				}
			);
			if ( result.ok ) {
				mtimeRef.current = result.mtime;
				return 'ok';
			}
			return 'error';
		},
		[ projectId, folder, relPath, useMarkdownIpc ]
	);

	// Use a {title, body} snapshot for source markdown so the autosave debounce
	// also fires on title-only edits. Other folders keep the body-only shape
	// since the title isn't editable in this surface.
	const autoSaveValue: Snapshot = showTitleInput
		? { kind: 'note', title: titleInput, body }
		: { kind: 'body', body };

	const { state: saveState } = useAutoSave< Snapshot >( {
		value: autoSaveValue,
		enabled: load.status === 'ready',
		save,
		eq: snapshotEq,
	} );

	// Mirrored so the file-watcher handler (subscribed once per
	// projectId/relPath) reads the latest save state without re-subscribing.
	const saveStateRef = useRef( saveState );
	useEffect( () => {
		saveStateRef.current = saveState;
	}, [ saveState ] );

	// Watch the open file for external changes (agent edits, terminal
	// edits). On change: ignore if it matches our own last-save mtime
	// (self-write); ignore if there are unsaved local edits (would clobber
	// the user's work); otherwise bump reloadCounter to re-run the load
	// effect, which reloads from disk and remounts the editor. Only wired
	// for note-backed files (drafts / done / sources) — the project.readFile
	// branch covers arbitrary binaries that the watcher doesn't serve.
	useEffect( () => {
		if ( ! useMarkdownIpc ) {
			return;
		}
		void window.api.drafts.watch( projectId, relPath, { folder } );
		const off = window.api.drafts.onFileChanged( ( event ) => {
			if ( event.projectId !== projectId || event.relPath !== relPath ) {
				return;
			}
			if ( event.mtime !== null && event.mtime === mtimeRef.current ) {
				return;
			}
			const s = saveStateRef.current;
			if ( s !== 'idle' && s !== 'saved' ) {
				// eslint-disable-next-line no-console
				console.warn(
					'[inline-file-editor] external change while dirty, skipping reload'
				);
				return;
			}
			setReloadCounter( ( c ) => c + 1 );
		} );
		return () => {
			off();
			void window.api.drafts.unwatch();
		};
	}, [ projectId, folder, relPath, useMarkdownIpc ] );

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
			// Auto-rename today is wired through `sources:rename`. Check
			// files keep their original filename — the panel groups by
			// frontmatter title for display, so the disk name is just an
			// id. Drop into a no-op for the checks folder.
			if ( folder === 'checks' ) {
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
			// file already carries the new frontmatter title. Bypass the
			// autosave debounce — when only the title changed and not the
			// body, useAutoSave's flush short-circuits on equal snapshots.
			await save( { kind: 'note', title: titleInput, body } );
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
			selfRenamedToRef.current = result.relPath;
			onRelPathChanged?.( result.relPath );
		};
	}, [
		showTitleInput,
		folder,
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
						const next = e.target.value;
						setTitleInput( next );
						titleRef.current = next;
						// Live-update the preview header. Empty input ⇒ fall
						// back to the filename.
						onDisplayTitleChange?.( next.length > 0 ? next : null );
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
