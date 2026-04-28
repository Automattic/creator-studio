import React, { useEffect, useState } from 'react';

import type { DirEntry } from '../../types';

type GroupKey = 'sources' | 'notes' | 'drafts' | 'published';

type GroupSpec = {
	key: GroupKey;
	label: string;
	folder: string;
};

const GROUPS: GroupSpec[] = [
	{ key: 'sources', label: 'Sources', folder: 'raw' },
	{ key: 'notes', label: 'Notes', folder: 'notes' },
	{ key: 'drafts', label: 'Drafts', folder: 'drafts' },
	{ key: 'published', label: 'Published', folder: 'published' },
];

type GroupState =
	| { status: 'loading' }
	| { status: 'loaded'; files: DirEntry[] }
	| { status: 'error' };

type Props = {
	projectId: string;
};

export function ResourcesGrid( { projectId }: Props ): React.ReactElement {
	const [ groups, setGroups ] = useState< Record< GroupKey, GroupState > >(
		() => ( {
			sources: { status: 'loading' },
			notes: { status: 'loading' },
			drafts: { status: 'loading' },
			published: { status: 'loading' },
		} )
	);

	useEffect( () => {
		let cancelled = false;
		setGroups( {
			sources: { status: 'loading' },
			notes: { status: 'loading' },
			drafts: { status: 'loading' },
			published: { status: 'loading' },
		} );
		for ( const group of GROUPS ) {
			void window.api.project
				.listFiles( projectId, group.folder )
				.then( ( entries ) => {
					if ( cancelled ) {
						return;
					}
					setGroups( ( prev ) => ( {
						...prev,
						[ group.key ]: { status: 'loaded', files: entries },
					} ) );
				} )
				.catch( () => {
					if ( cancelled ) {
						return;
					}
					setGroups( ( prev ) => ( {
						...prev,
						[ group.key ]: { status: 'error' },
					} ) );
				} );
		}
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	return (
		<div className="resources-grid" data-testid="resources-grid">
			{ GROUPS.map( ( group ) => {
				const state = groups[ group.key ];
				const count =
					state.status === 'loaded' ? state.files.length : null;
				return (
					<section
						key={ group.key }
						className="resources-grid-group"
						data-testid={ `resources-group-${ group.key }` }
					>
						<header className="resources-grid-group-header">
							<span className="resources-grid-group-label">
								{ group.label }
							</span>
							{ count !== null && (
								<span className="resources-grid-group-count">
									· { count }
								</span>
							) }
							<span className="resources-grid-group-rule" />
						</header>
						{ state.status === 'loading' && (
							<div className="resources-grid-hint">Loading…</div>
						) }
						{ state.status === 'error' && (
							<div className="resources-grid-hint">
								Failed to read
							</div>
						) }
						{ state.status === 'loaded' &&
							state.files.length === 0 && (
								<div className="resources-grid-hint">
									No { group.label.toLowerCase() } yet
								</div>
							) }
						{ state.status === 'loaded' &&
							state.files.length > 0 && (
								<div className="resources-grid-cards">
									{ state.files.map( ( file ) => (
										<article
											key={ file.name }
											className="resources-grid-card"
											data-testid={ `resources-card-${ group.key }-${ file.name }` }
										>
											<span className="resources-grid-card-name">
												{ file.name }
											</span>
										</article>
									) ) }
								</div>
							) }
					</section>
				);
			} ) }
		</div>
	);
}
