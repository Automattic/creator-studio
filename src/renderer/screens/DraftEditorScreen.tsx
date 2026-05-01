import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import {
	markdownImageWidget,
	projectIdFacet,
} from '../editor/markdown-image-widget';
import { markdownFormattingBindings } from '../editor/markdown-keymap';
import { markdownLiveDecorations } from '../editor/markdown-live-decorations';
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
	// the Esc keymap rather than re-mounting on every change.
	const escHandlerRef = useRef< () => void >( () => {} );

	useEffect( () => {
		if ( state.status !== 'ready' || ! hostRef.current ) {
			return;
		}
		const view = new EditorView( {
			parent: hostRef.current,
			state: EditorState.create( {
				doc: state.draft.body,
				extensions: [
					history(),
					keymap.of( [
						...markdownFormattingBindings,
						{
							key: 'Escape',
							run: () => {
								escHandlerRef.current();
								return true;
							},
						},
						...defaultKeymap,
						...historyKeymap,
					] ),
					projectIdFacet.of( projectId ),
					markdown(),
					syntaxHighlighting( defaultHighlightStyle ),
					markdownLiveDecorations,
					markdownImageWidget,
					EditorView.lineWrapping,
					EditorView.contentAttributes.of( { spellcheck: 'true' } ),
					EditorView.updateListener.of( ( u ) => {
						if ( u.docChanged ) {
							setBody( u.state.doc.toString() );
						}
					} ),
				],
			} ),
		} );
		viewRef.current = view;
		// Auto-focus once the editor is mounted; cursor lands at end of doc
		// so users can keep writing where they left off.
		view.focus();
		view.dispatch( {
			selection: { anchor: view.state.doc.length },
		} );
		return () => {
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
			void handleBack();
		};
	}, [ handleBack ] );

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
		const insertImage = async ( file: File ): Promise< void > => {
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
			const head = view.state.selection.main.head;
			view.dispatch( {
				changes: { from: head, insert },
				selection: { anchor: head + insert.length },
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
			for ( const f of images ) {
				void insertImage( f );
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
			for ( const f of files ) {
				void insertImage( f );
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
					title={ `${ wordCount } words` }
				>
					{ wordCount.toLocaleString() } words
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
		</section>
	);
}
