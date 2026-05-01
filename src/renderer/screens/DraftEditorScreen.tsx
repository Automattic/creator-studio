import React, { useEffect, useState } from 'react';

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

export function DraftEditorScreen( {
	projectId,
	relPath,
	title,
	onBack,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< State >( { status: 'loading' } );

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

	const headerTitle = state.status === 'ready' ? state.draft.title : title;

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
					onClick={ onBack }
				>
					← Drafts
				</button>
				<h1
					className="draft-editor-title"
					data-testid="draft-editor-title"
				>
					{ headerTitle }
				</h1>
				<span
					className="draft-editor-status"
					data-testid="draft-editor-status"
					data-state="idle"
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
					className="draft-editor-host"
					data-testid="draft-editor-host"
					data-status="ready"
				>
					<pre className="draft-editor-raw">{ state.draft.body }</pre>
				</div>
			) }
		</section>
	);
}
