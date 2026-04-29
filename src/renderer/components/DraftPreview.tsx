import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { relativeDate } from '../lib/relativeDate';

type LoadState =
	| { status: 'loading' }
	| { status: 'loaded'; text: string; mtime: number | null }
	| { status: 'error' };

type Props = {
	projectId: string;
	relPath: string;
	name: string;
	onBack: () => void;
};

export function DraftPreview( {
	projectId,
	relPath,
	name,
	onBack,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< LoadState >( { status: 'loading' } );
	// Bumped each time the agent finishes a turn for this project; the
	// load effect re-keys on it so the preview reflects file edits the
	// agent just made. Cheap re-read, not a watcher — manual edits made
	// outside the app won't show until the next agent turn.
	const [ reloadNonce, setReloadNonce ] = useState( 0 );

	// `relPath` is the path inside the drafts folder (e.g. `foo.md` or
	// `2026-04/foo.md`); the read-file IPC channel expects a path relative
	// to the project root, so prepend `drafts/`.
	const subPath = `drafts/${ relPath }`;

	useEffect( () => {
		const off = window.api.agent.onEvent( ( event ) => {
			if ( event.kind === 'done' && event.projectId === projectId ) {
				setReloadNonce( ( n ) => n + 1 );
			}
		} );
		return off;
	}, [ projectId ] );

	useEffect( () => {
		let cancelled = false;
		// On a refresh (reloadNonce > 0) keep showing the previous content
		// while we re-read — flashing "Loading…" mid-conversation would be
		// noisy.
		if ( reloadNonce === 0 ) {
			setState( { status: 'loading' } );
		}
		void window.api.project
			.readFile( projectId, subPath )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setState( { status: 'error' } );
					return;
				}
				setState( {
					status: 'loaded',
					text: res.text,
					mtime: res.mtime,
				} );
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
	}, [ projectId, subPath, reloadNonce ] );

	const date =
		state.status === 'loaded' && state.mtime !== null
			? relativeDate( state.mtime )
			: null;

	return (
		<div className="draft-preview" data-testid="draft-preview">
			<div className="draft-preview-header">
				<button
					type="button"
					className="draft-preview-back"
					data-testid="draft-preview-back"
					onClick={ onBack }
					aria-label="Back to resources"
					title="Back to resources"
				>
					<span aria-hidden="true">‹</span> Back
				</button>
				<div className="draft-preview-title-wrap">
					<span
						className="draft-preview-title"
						data-testid="draft-preview-title"
						title={ relPath }
					>
						{ name }
					</span>
					{ date && (
						<span className="draft-preview-date">{ date }</span>
					) }
				</div>
			</div>
			<div
				className="draft-preview-body"
				data-testid="draft-preview-body"
			>
				{ state.status === 'loading' && (
					<div className="resources-grid-hint">Loading…</div>
				) }
				{ state.status === 'error' && (
					<div className="resources-grid-hint">
						Couldn&apos;t read this file
					</div>
				) }
				{ state.status === 'loaded' &&
					( state.text.length === 0 ? (
						<div className="resources-grid-hint">
							This file is empty or too large to preview
						</div>
					) : (
						<div className="draft-preview-markdown">
							<ReactMarkdown remarkPlugins={ [ remarkGfm ] }>
								{ state.text }
							</ReactMarkdown>
						</div>
					) ) }
			</div>
		</div>
	);
}
