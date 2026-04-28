import React, { useEffect, useState } from 'react';

import type { DirEntry, SearchHit } from '../../types';

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

const FOLDER_TO_KEY: Record< string, GroupKey > = GROUPS.reduce(
	( acc, g ) => {
		acc[ g.folder ] = g.key;
		return acc;
	},
	{} as Record< string, GroupKey >
);

type GroupState =
	| { status: 'loading' }
	| { status: 'loaded'; files: DirEntry[] }
	| { status: 'error' };

type SearchState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded'; hits: SearchHit[] }
	| { status: 'error' };

type Drill = { groupKey: GroupKey; parts: string[] };

type Props = {
	projectId: string;
};

const initialGroups = (): Record< GroupKey, GroupState > => ( {
	sources: { status: 'loading' },
	notes: { status: 'loading' },
	drafts: { status: 'loading' },
	published: { status: 'loading' },
} );

function groupForKey( key: GroupKey ): GroupSpec {
	const spec = GROUPS.find( ( g ) => g.key === key );
	if ( ! spec ) {
		throw new Error( `Unknown resources group: ${ key }` );
	}
	return spec;
}

function drillSubPath( drill: Drill ): string {
	const folder = groupForKey( drill.groupKey ).folder;
	return drill.parts.length === 0
		? folder
		: `${ folder }/${ drill.parts.join( '/' ) }`;
}

function parentParts( relPath: string ): string[] {
	const parts = relPath.split( '/' );
	parts.pop();
	return parts;
}

export function ResourcesGrid( { projectId }: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const [ drill, setDrill ] = useState< Drill | null >( null );
	const [ groups, setGroups ] =
		useState< Record< GroupKey, GroupState > >( initialGroups );
	const [ drillState, setDrillState ] = useState< GroupState >( {
		status: 'loading',
	} );
	const [ searchState, setSearchState ] = useState< SearchState >( {
		status: 'idle',
	} );

	useEffect( () => {
		setDrill( null );
		setQuery( '' );
	}, [ projectId ] );

	const normalizedQuery = query.trim().toLowerCase();
	const isSearching = normalizedQuery.length > 0;

	useEffect( () => {
		if ( drill !== null || isSearching ) {
			return;
		}
		let cancelled = false;
		setGroups( initialGroups() );
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
	}, [ projectId, drill, isSearching ] );

	useEffect( () => {
		if ( drill === null || isSearching ) {
			return;
		}
		let cancelled = false;
		setDrillState( { status: 'loading' } );
		const subPath = drillSubPath( drill );
		void window.api.project
			.listFiles( projectId, subPath )
			.then( ( entries ) => {
				if ( cancelled ) {
					return;
				}
				setDrillState( { status: 'loaded', files: entries } );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setDrillState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, drill, isSearching ] );

	useEffect( () => {
		if ( ! isSearching ) {
			setSearchState( { status: 'idle' } );
			return;
		}
		let cancelled = false;
		setSearchState( { status: 'loading' } );
		const folders = GROUPS.map( ( g ) => g.folder );
		void window.api.project
			.searchFiles( projectId, query, folders )
			.then( ( hits ) => {
				if ( cancelled ) {
					return;
				}
				setSearchState( { status: 'loaded', hits } );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setSearchState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, query, isSearching ] );

	const openFolder = ( groupKey: GroupKey, name: string ): void => {
		const nextParts = drill?.groupKey === groupKey ? drill.parts : [];
		setDrill( { groupKey, parts: [ ...nextParts, name ] } );
		setQuery( '' );
	};

	const openHit = ( hit: SearchHit ): void => {
		const groupKey = FOLDER_TO_KEY[ hit.folder ];
		if ( ! groupKey ) {
			return;
		}
		const parts = hit.isDirectory
			? hit.relPath.split( '/' )
			: parentParts( hit.relPath );
		setDrill( { groupKey, parts } );
		setQuery( '' );
	};

	return (
		<div className="resources-grid" data-testid="resources-grid">
			<div className="resources-grid-search">
				<input
					type="search"
					className="resources-grid-search-input"
					data-testid="resources-search"
					placeholder="Search resources…"
					value={ query }
					onChange={ ( e ) => setQuery( e.target.value ) }
				/>
			</div>

			{ ! isSearching && drill !== null && (
				<nav
					className="resources-grid-breadcrumb"
					data-testid="resources-breadcrumb"
					aria-label="Resources path"
				>
					<button
						type="button"
						className="resources-grid-breadcrumb-link"
						data-testid="resources-breadcrumb-root"
						onClick={ () => {
							setDrill( null );
							setQuery( '' );
						} }
					>
						All resources
					</button>
					<span
						className="resources-grid-breadcrumb-sep"
						aria-hidden="true"
					>
						/
					</span>
					{ drill.parts.length === 0 ? (
						<span
							className="resources-grid-breadcrumb-current"
							aria-current="page"
						>
							{ groupForKey( drill.groupKey ).label }
						</span>
					) : (
						<button
							type="button"
							className="resources-grid-breadcrumb-link"
							data-testid={ `resources-breadcrumb-group-${ drill.groupKey }` }
							onClick={ () => {
								setDrill( {
									groupKey: drill.groupKey,
									parts: [],
								} );
								setQuery( '' );
							} }
						>
							{ groupForKey( drill.groupKey ).label }
						</button>
					) }
					{ drill.parts.map( ( part, i ) => {
						const isLast = i === drill.parts.length - 1;
						return (
							<React.Fragment key={ `${ i }-${ part }` }>
								<span
									className="resources-grid-breadcrumb-sep"
									aria-hidden="true"
								>
									/
								</span>
								{ isLast ? (
									<span
										className="resources-grid-breadcrumb-current"
										aria-current="page"
									>
										{ part }
									</span>
								) : (
									<button
										type="button"
										className="resources-grid-breadcrumb-link"
										data-testid={ `resources-breadcrumb-part-${ i }` }
										onClick={ () => {
											setDrill( {
												groupKey: drill.groupKey,
												parts: drill.parts.slice(
													0,
													i + 1
												),
											} );
											setQuery( '' );
										} }
									>
										{ part }
									</button>
								) }
							</React.Fragment>
						);
					} ) }
				</nav>
			) }

			{ isSearching &&
				renderSearchResults( {
					searchState,
					onOpenHit: openHit,
				} ) }

			{ ! isSearching &&
				drill === null &&
				GROUPS.map( ( group ) => {
					const state = groups[ group.key ];
					const files = state.status === 'loaded' ? state.files : [];
					const count =
						state.status === 'loaded' ? files.length : null;
					return (
						<section
							key={ group.key }
							className="resources-grid-group"
							data-testid={ `resources-group-${ group.key }` }
						>
							<header className="resources-grid-group-header">
								<button
									type="button"
									className="resources-grid-group-heading"
									data-testid={ `resources-group-heading-${ group.key }` }
									onClick={ () => {
										setDrill( {
											groupKey: group.key,
											parts: [],
										} );
										setQuery( '' );
									} }
									title={ `View ${ group.label }` }
								>
									<span className="resources-grid-group-label">
										{ group.label }
									</span>
									{ count !== null && (
										<span className="resources-grid-group-count">
											· { count }
										</span>
									) }
								</button>
								<span className="resources-grid-group-rule" />
							</header>
							{ state.status === 'loading' && (
								<div className="resources-grid-hint">
									Loading…
								</div>
							) }
							{ state.status === 'error' && (
								<div className="resources-grid-hint">
									Failed to read
								</div>
							) }
							{ state.status === 'loaded' &&
								files.length === 0 && (
									<div className="resources-grid-hint">
										No { group.label.toLowerCase() } yet
									</div>
								) }
							{ state.status === 'loaded' && files.length > 0 && (
								<div className="resources-grid-cards">
									{ files.map( ( file ) =>
										renderCard( {
											file,
											testIdPrefix: `resources-card-${ group.key }`,
											onOpen: () =>
												openFolder(
													group.key,
													file.name
												),
										} )
									) }
								</div>
							) }
						</section>
					);
				} ) }

			{ ! isSearching && drill !== null && (
				<section
					className="resources-grid-group"
					data-testid="resources-group-drill"
				>
					{ drillState.status === 'loading' && (
						<div className="resources-grid-hint">Loading…</div>
					) }
					{ drillState.status === 'error' && (
						<div className="resources-grid-hint">
							Failed to read
						</div>
					) }
					{ drillState.status === 'loaded' &&
						( drillState.files.length === 0 ? (
							<div className="resources-grid-hint">
								Folder is empty
							</div>
						) : (
							<div className="resources-grid-cards">
								{ drillState.files.map( ( file ) =>
									renderCard( {
										file,
										testIdPrefix: 'resources-card-drill',
										onOpen: () =>
											setDrill( {
												groupKey: drill.groupKey,
												parts: [
													...drill.parts,
													file.name,
												],
											} ),
									} )
								) }
							</div>
						) ) }
				</section>
			) }
		</div>
	);
}

function renderSearchResults( {
	searchState,
	onOpenHit,
}: {
	searchState: SearchState;
	onOpenHit: ( hit: SearchHit ) => void;
} ): React.ReactElement {
	if ( searchState.status === 'loading' || searchState.status === 'idle' ) {
		return (
			<div
				className="resources-grid-hint"
				data-testid="resources-search-loading"
			>
				Searching…
			</div>
		);
	}
	if ( searchState.status === 'error' ) {
		return (
			<div
				className="resources-grid-hint"
				data-testid="resources-search-error"
			>
				Search failed
			</div>
		);
	}
	if ( searchState.hits.length === 0 ) {
		return (
			<div
				className="resources-grid-hint"
				data-testid="resources-search-empty"
			>
				No matches
			</div>
		);
	}
	const byGroup = new Map< GroupKey, SearchHit[] >();
	for ( const hit of searchState.hits ) {
		const key = FOLDER_TO_KEY[ hit.folder ];
		if ( ! key ) {
			continue;
		}
		const arr = byGroup.get( key ) ?? [];
		arr.push( hit );
		byGroup.set( key, arr );
	}
	return (
		<>
			{ GROUPS.map( ( group ) => {
				const hits = byGroup.get( group.key );
				if ( ! hits || hits.length === 0 ) {
					return null;
				}
				return (
					<section
						key={ group.key }
						className="resources-grid-group"
						data-testid={ `resources-search-group-${ group.key }` }
					>
						<header className="resources-grid-group-header">
							<span className="resources-grid-group-label">
								{ group.label }
							</span>
							<span className="resources-grid-group-count">
								· { hits.length }
							</span>
							<span className="resources-grid-group-rule" />
						</header>
						<div className="resources-grid-cards">
							{ hits.map( ( hit ) =>
								renderHitCard( {
									hit,
									groupKey: group.key,
									onOpen: () => onOpenHit( hit ),
								} )
							) }
						</div>
					</section>
				);
			} ) }
		</>
	);
}

function renderHitCard( {
	hit,
	groupKey,
	onOpen,
}: {
	hit: SearchHit;
	groupKey: GroupKey;
	onOpen: () => void;
} ): React.ReactElement {
	const parent = parentParts( hit.relPath ).join( '/' );
	const key = `${ hit.folder }/${ hit.relPath }`;
	const testId = `resources-search-card-${ groupKey }-${ hit.relPath }`;
	let title = 'Open';
	if ( hit.isDirectory ) {
		title = `Open ${ hit.relPath }`;
	} else if ( parent ) {
		title = `Open ${ parent }`;
	}
	return (
		<button
			key={ key }
			type="button"
			className="resources-grid-card"
			data-kind={ hit.isDirectory ? 'dir' : 'file' }
			data-testid={ testId }
			onClick={ onOpen }
			title={ title }
		>
			<span className="resources-grid-card-body">
				{ parent && (
					<span className="resources-grid-card-path">
						{ parent }/
					</span>
				) }
				<span className="resources-grid-card-name">{ hit.name }</span>
			</span>
			<span className="resources-grid-card-affordance" aria-hidden="true">
				›
			</span>
		</button>
	);
}

function renderCard( {
	file,
	testIdPrefix,
	onOpen,
}: {
	file: DirEntry;
	testIdPrefix: string;
	onOpen: () => void;
} ): React.ReactElement {
	const testId = `${ testIdPrefix }-${ file.name }`;
	if ( file.isDirectory ) {
		return (
			<button
				key={ file.name }
				type="button"
				className="resources-grid-card"
				data-kind="dir"
				data-testid={ testId }
				onClick={ onOpen }
				title={ `Open ${ file.name }` }
			>
				<span className="resources-grid-card-name">{ file.name }</span>
				<span
					className="resources-grid-card-affordance"
					aria-hidden="true"
				>
					›
				</span>
			</button>
		);
	}
	return (
		<article
			key={ file.name }
			className="resources-grid-card"
			data-kind="file"
			data-testid={ testId }
		>
			<span className="resources-grid-card-name">{ file.name }</span>
		</article>
	);
}
