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

import { useAutoSave } from '../hooks/useAutoSave';

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
					keymap.of( [ ...defaultKeymap, ...historyKeymap ] ),
					markdown(),
					syntaxHighlighting( defaultHighlightStyle ),
					EditorView.lineWrapping,
					EditorView.updateListener.of( ( u ) => {
						if ( u.docChanged ) {
							setBody( u.state.doc.toString() );
						}
					} ),
				],
			} ),
		} );
		viewRef.current = view;
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
