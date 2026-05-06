import React, { useEffect, useState } from 'react';

import type { Draft } from '../../types';

import { DraftsList } from '../components/DraftsList';

type Props = {
	onSelectProject: ( projectId: string ) => void;
	onOpenDraft: ( draft: {
		projectId: string;
		relPath: string;
		title: string;
	} ) => void;
};

type State =
	| { status: 'loading' }
	| { status: 'loaded'; drafts: Draft[] }
	| { status: 'error' };

export function DoneScreen( {
	onSelectProject,
	onOpenDraft,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< State >( { status: 'loading' } );

	useEffect( () => {
		let cancelled = false;
		void window.api.done
			.listAll()
			.then( ( drafts ) => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'loaded', drafts } );
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
	}, [] );

	if ( state.status === 'loading' ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-done"
				aria-label="Done"
			>
				<p className="drafts-screen-hint" data-testid="done-loading">
					Loading…
				</p>
			</section>
		);
	}

	if ( state.status === 'error' ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-done"
				aria-label="Done"
			>
				<p className="drafts-screen-hint" data-testid="done-error">
					Couldn&apos;t read done items.
				</p>
			</section>
		);
	}

	if ( state.drafts.length === 0 ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-done"
				aria-label="Done"
			>
				<p className="drafts-screen-hint" data-testid="done-empty">
					Nothing here yet — Mark as done from the draft editor moves
					files into <code>done/</code>.
				</p>
			</section>
		);
	}

	return (
		<section
			className="drafts-screen"
			data-testid="screen-done"
			aria-label="Done"
		>
			<DraftsList
				items={ state.drafts }
				ariaLabel="Done across all projects"
				onSelectProject={ onSelectProject }
				onOpenDraft={ onOpenDraft }
			/>
		</section>
	);
}
