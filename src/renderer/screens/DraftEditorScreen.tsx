import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentLess,
	insertTab,
} from '@codemirror/commands';
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
import { gotoLine, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { dropCursor, EditorView, keymap } from '@codemirror/view';

import { AiMenu, type AiMenuPosition } from '../editor/AiMenu';
import { readMemo, writeMemo } from '../editor/draft-cursor-memory';
import {
	markdownImageWidget,
	projectIdFacet,
} from '../editor/markdown-image-widget';
import {
	markdownBlockBindings,
	markdownFormattingBindings,
	markdownTabBindings,
	pasteUrlAsLink,
	smartSelectionWrap,
} from '../editor/markdown-keymap';
import { markdownLinkClick } from '../editor/markdown-link-click';
import { markdownLiveDecorations } from '../editor/markdown-live-decorations';
import { markdownTaskWidget } from '../editor/markdown-task-widget';
import { useAutoSave } from '../hooks/useAutoSave';

function countWords( text: string ): number {
	const matches = text.match( /\b[\p{L}\p{N}'-]+\b/gu );
	return matches ? matches.length : 0;
}

type Props = {
	projectId: string;
	relPath: string;
	title: string;
	onBack: () => void;
};

type LoadedDraft = {
	title: string;
	body: string;
	frontmatter: Record< string, unknown >;
	mtime: number;
};

type State =
	| { status: 'loading' }
	| { status: 'ready'; draft: LoadedDraft }
	| { status: 'error' };

type Snapshot = { title: string; body: string };

const snapshotEq = ( a: Snapshot, b: Snapshot ): boolean =>
	a.title === b.title && a.body === b.body;

export function DraftEditorScreen( {
	projectId,
	relPath,
	title,
	onBack,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< State >( { status: 'loading' } );
	const [ titleInput, setTitleInput ] = useState< string >( title );
	const [ body, setBody ] = useState< string >( '' );
	const [ selectionInfo, setSelectionInfo ] = useState< {
		words: number;
	} | null >( null );
	const [ aiMenu, setAiMenu ] = useState< {
		open: boolean;
		position: AiMenuPosition | null;
	} >( { open: false, position: null } );
	// Frontmatter (other keys) and mtime ride along — both get refreshed
	// on each successful save so subsequent writes don't trigger a stale
	// mtime conflict guard.
	const frontmatterRef = useRef< Record< string, unknown > >( {} );
	const mtimeRef = useRef< number | null >( null );
	const hostRef = useRef< HTMLDivElement | null >( null );
	const viewRef = useRef< EditorView | null >( null );

	useEffect( () => {
		let cancelled = false;
		void window.api.drafts
			.read( projectId, relPath )
			.then( ( result ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! result ) {
					setState( { status: 'error' } );
					return;
				}
				setState( { status: 'ready', draft: result } );
				setTitleInput( result.title );
				setBody( result.body );
				frontmatterRef.current = result.frontmatter;
				mtimeRef.current = result.mtime;
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, relPath ] );

	// `onBack` and `flush` change identity each render; the editor must be
	// mounted once per draft, so we read the latest values via a ref inside
	// the Esc / Cmd+J keymaps rather than re-mounting on every change.
	const escHandlerRef = useRef< () => void >( () => {} );
	const aiOpenHandlerRef = useRef< ( view: EditorView ) => void >( () => {} );

	useEffect( () => {
		if ( state.status !== 'ready' || ! hostRef.current ) {
			return;
		}
		let memoTimer: ReturnType< typeof setTimeout > | null = null;
		const flushMemo = (): void => {
			const v = viewRef.current;
			if ( ! v ) {
				return;
			}
			writeMemo( projectId, relPath, {
				cursor: v.state.selection.main.head,
				scrollTop: v.scrollDOM.scrollTop,
			} );
		};
		const queueMemoWrite = (): void => {
			if ( memoTimer ) {
				clearTimeout( memoTimer );
			}
			memoTimer = setTimeout( flushMemo, 250 );
		};
		const view = new EditorView( {
			parent: hostRef.current,
			state: EditorState.create( {
				doc: state.draft.body,
				extensions: [
					history(),
					keymap.of( [
						...markdownFormattingBindings,
						{
							key: 'Mod-j',
							run: ( v ) => {
								aiOpenHandlerRef.current( v );
								return true;
							},
						},
						{
							key: 'Escape',
							run: () => {
								escHandlerRef.current();
								return true;
							},
						},
						// Tab/Shift+Tab. The list-aware bindings come first: when
						// the cursor is inside a ListItem/Task, Tab nests and
						// Shift+Tab outdents. They return false on non-list
						// lines, falling through to insertTab/indentLess which
						// inserts a literal tab and removes leading indent.
						...markdownTabBindings,
						{ key: 'Tab', run: insertTab, shift: indentLess },
						...markdownBlockBindings,
						// markdownKeymap covers Enter-to-continue-list and
						// related markup-aware editing. Place before defaultKeymap
						// so its Enter binding wins over the plain newline.
						...markdownKeymap,
						// closeBrackets pairs (), [], {}, "", '', ``. Its keymap
						// adds smart Backspace that deletes both characters of an
						// empty pair.
						...closeBracketsKeymap,
						// search panel: Cmd+F find, Cmd+G next, Shift+Cmd+G prev,
						// Cmd+Alt+F replace, Cmd+D select-next-occurrence, etc.
						...searchKeymap,
						// gotoLine prompts for a line number (Cmd+Alt+G).
						{ key: 'Mod-Alt-g', run: gotoLine },
						...defaultKeymap,
						...historyKeymap,
					] ),
					projectIdFacet.of( projectId ),
					// One indent unit = a real tab character so Tab and
					// Shift+Tab insert/remove the same atomic glyph the user
					// typed. With the default 2-space unit, Shift+Tab on `\t`
					// would convert it to spaces.
					indentUnit.of( '\t' ),
					// markdownLanguage = GFM (task lists, tables,
					// strikethrough, autolinks). Without it, `[ ]` parses as
					// link brackets and the LinkMark hide rule eats them.
					markdown( { base: markdownLanguage } ),
					syntaxHighlighting( defaultHighlightStyle ),
					markdownLiveDecorations,
					markdownTaskWidget,
					markdownImageWidget,
					// Stock CM6 niceties any prose editor expects.
					closeBrackets(),
					bracketMatching(),
					dropCursor(),
					search( { top: true } ),
					smartSelectionWrap,
					pasteUrlAsLink,
					markdownLinkClick,
					EditorView.lineWrapping,
					EditorView.contentAttributes.of( { spellcheck: 'true' } ),
					EditorView.updateListener.of( ( u ) => {
						if ( u.docChanged ) {
							setBody( u.state.doc.toString() );
						}
						if ( u.selectionSet || u.docChanged ) {
							const range = u.state.selection.main;
							if ( range.empty ) {
								setSelectionInfo( null );
							} else {
								const text = u.state.doc.sliceString(
									range.from,
									range.to
								);
								const matches =
									text.match( /\b[\p{L}\p{N}'-]+\b/gu );
								setSelectionInfo( {
									words: matches ? matches.length : 0,
								} );
							}
							queueMemoWrite();
						}
					} ),
				],
			} ),
		} );
		viewRef.current = view;
		// Restore the saved cursor + scroll for this draft, falling back to
		// end-of-doc if no memo is stored yet.
		const memo = readMemo( projectId, relPath );
		const restoreCursor =
			memo && memo.cursor >= 0 && memo.cursor <= view.state.doc.length
				? memo.cursor
				: view.state.doc.length;
		view.focus();
		view.dispatch( {
			selection: { anchor: restoreCursor },
			effects: EditorView.scrollIntoView( restoreCursor, {
				y: 'center',
			} ),
		} );
		if ( memo ) {
			view.scrollDOM.scrollTop = memo.scrollTop;
		}
		return () => {
			if ( memoTimer ) {
				clearTimeout( memoTimer );
			}
			flushMemo();
			view.destroy();
			viewRef.current = null;
		};
		// Mount once per (projectId, relPath); subsequent state edits flow
		// through the updateListener rather than re-creating the view.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ state.status ] );

	const snapshot = useMemo< Snapshot >(
		() => ( { title: titleInput, body } ),
		[ titleInput, body ]
	);

	const save = useCallback(
		async ( s: Snapshot ): Promise< 'ok' | 'error' > => {
			const result = await window.api.drafts.write( projectId, relPath, {
				title: s.title,
				body: s.body,
				frontmatter: frontmatterRef.current,
				expectedMtime: mtimeRef.current,
			} );
			if ( result.ok ) {
				mtimeRef.current = result.mtime;
				return 'ok';
			}
			return 'error';
		},
		[ projectId, relPath ]
	);

	const { state: saveState, flush } = useAutoSave< Snapshot >( {
		value: snapshot,
		enabled: state.status === 'ready',
		save,
		eq: snapshotEq,
	} );

	const handleBack = useCallback( async (): Promise< void > => {
		await flush();
		onBack();
	}, [ flush, onBack ] );

	useEffect( () => {
		escHandlerRef.current = () => {
			if ( aiMenu.open ) {
				setAiMenu( { open: false, position: null } );
				return;
			}
			void handleBack();
		};
	}, [ handleBack, aiMenu.open ] );

	useEffect( () => {
		aiOpenHandlerRef.current = ( view: EditorView ) => {
			const head = view.state.selection.main.head;
			const rect = view.coordsAtPos( head );
			if ( ! rect ) {
				return;
			}
			setAiMenu( {
				open: true,
				position: { top: rect.bottom + 4, left: rect.left },
			} );
		};
	}, [] );

	const closeAiMenu = useCallback( (): void => {
		setAiMenu( { open: false, position: null } );
	}, [] );

	// Close the menu when the editor scrolls — the anchor coords would drift
	// otherwise. Cheaper than tracking the cursor through scroll events.
	useEffect( () => {
		if ( ! aiMenu.open ) {
			return;
		}
		const scroller = hostRef.current?.querySelector( '.cm-scroller' );
		if ( ! scroller ) {
			return;
		}
		const onScroll = (): void => closeAiMenu();
		scroller.addEventListener( 'scroll', onScroll, { passive: true } );
		return () => scroller.removeEventListener( 'scroll', onScroll );
	}, [ aiMenu.open, closeAiMenu ] );

	const wordCount = useMemo( () => countWords( body ), [ body ] );

	// Paste / drop image insertion. We hand the raw bytes to the main
	// process which dedups by content hash, then dispatch a CM6 transaction
	// inserting `![alt](assets/<hash>.<ext>)` at the current selection. The
	// markdown source stays portable (relative paths only); the renderer
	// reaches the file via the studio-asset:// protocol.
	useEffect( () => {
		if ( state.status !== 'ready' ) {
			return;
		}
		const host = hostRef.current;
		if ( ! host ) {
			return;
		}
		const insertImage = async (
			file: File,
			atPos: number
		): Promise< void > => {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array( buf );
			let binary = '';
			// String.fromCharCode with apply is faster than .map+join for small
			// payloads and sidesteps spread-arg argument-count limits via chunks.
			const chunkSize = 0x8000;
			for ( let i = 0; i < bytes.length; i += chunkSize ) {
				binary += String.fromCharCode.apply(
					null,
					Array.from( bytes.subarray( i, i + chunkSize ) )
				);
			}
			const dataB64 = window.btoa( binary );
			const result = await window.api.drafts.saveImage( projectId, {
				mimeType: file.type,
				dataB64,
				originalFilename: file.name,
			} );
			if ( ! result.ok || ! viewRef.current ) {
				return;
			}
			const view = viewRef.current;
			const altText = file.name.replace( /\.[^.]+$/, '' );
			const insert = `\n![${ altText }](${ result.relPath })\n`;
			// Clamp in case the doc shrank during the IPC round-trip.
			const safePos = Math.min( atPos, view.state.doc.length );
			view.dispatch( {
				changes: { from: safePos, insert },
				selection: { anchor: safePos + insert.length },
			} );
		};
		const onPaste = ( e: ClipboardEvent ): void => {
			const items = Array.from( e.clipboardData?.items ?? [] );
			const images = items
				.filter(
					( it ) =>
						it.kind === 'file' && it.type.startsWith( 'image/' )
				)
				.map( ( it ) => it.getAsFile() )
				.filter( ( f ): f is File => f !== null );
			if ( images.length === 0 ) {
				return;
			}
			e.preventDefault();
			const view = viewRef.current;
			if ( ! view ) {
				return;
			}
			// Paste has no spatial coordinates; insert at the cursor.
			const pos = view.state.selection.main.head;
			for ( const f of images ) {
				void insertImage( f, pos );
			}
		};
		const onDrop = ( e: DragEvent ): void => {
			const files = Array.from( e.dataTransfer?.files ?? [] ).filter(
				( f ) => f.type.startsWith( 'image/' )
			);
			if ( files.length === 0 ) {
				return;
			}
			e.preventDefault();
			const view = viewRef.current;
			if ( ! view ) {
				return;
			}
			// Drop position comes from the event coords — what the user
			// saw under the dropCursor — not the stale text cursor.
			const dropPos =
				view.posAtCoords( {
					x: e.clientX,
					y: e.clientY,
				} ) ?? view.state.selection.main.head;
			for ( const f of files ) {
				void insertImage( f, dropPos );
			}
		};
		const onDragOver = ( e: DragEvent ): void => {
			if (
				Array.from( e.dataTransfer?.items ?? [] ).some( ( it ) =>
					it.type.startsWith( 'image/' )
				)
			) {
				e.preventDefault();
			}
		};
		host.addEventListener( 'paste', onPaste );
		host.addEventListener( 'drop', onDrop );
		host.addEventListener( 'dragover', onDragOver );
		return () => {
			host.removeEventListener( 'paste', onPaste );
			host.removeEventListener( 'drop', onDrop );
			host.removeEventListener( 'dragover', onDragOver );
		};
	}, [ state.status, projectId ] );

	return (
		<section
			className="draft-editor-screen"
			data-testid="screen-draft-editor"
			aria-label="Draft editor"
		>
			<header className="draft-editor-header">
				<button
					type="button"
					className="draft-editor-back"
					data-testid="draft-editor-back"
					onClick={ () => {
						void handleBack();
					} }
				>
					← Drafts
				</button>
				<input
					type="text"
					className="draft-editor-title-input"
					data-testid="draft-editor-title-input"
					aria-label="Draft title"
					placeholder="Untitled draft"
					value={ titleInput }
					onChange={ ( e ) => setTitleInput( e.target.value ) }
					disabled={ state.status !== 'ready' }
				/>
				<span
					className="draft-editor-word-count"
					data-testid="draft-editor-word-count"
					title={
						selectionInfo
							? `${ selectionInfo.words } words selected`
							: `${ wordCount } words`
					}
					data-mode={ selectionInfo ? 'selection' : 'document' }
				>
					{ selectionInfo
						? `${ selectionInfo.words.toLocaleString() } selected`
						: `${ wordCount.toLocaleString() } words` }
				</span>
				<span
					className="draft-editor-status"
					data-testid="draft-editor-status"
					data-state={ saveState }
				/>
			</header>
			{ state.status === 'loading' && (
				<div
					className="draft-editor-host"
					data-testid="draft-editor-host"
					data-status="loading"
				>
					Loading…
				</div>
			) }
			{ state.status === 'error' && (
				<div
					className="draft-editor-host"
					data-testid="draft-editor-host"
					data-status="error"
				>
					<p data-testid="draft-editor-error">
						Couldn&apos;t open draft.
					</p>
				</div>
			) }
			{ state.status === 'ready' && (
				<div
					ref={ hostRef }
					className="draft-editor-host"
					data-testid="draft-editor-host"
					data-status="ready"
				/>
			) }
			<AiMenu
				open={ aiMenu.open }
				position={ aiMenu.position }
				onClose={ closeAiMenu }
			/>
		</section>
	);
}
