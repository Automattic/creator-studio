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

export function ResourcesGrid( { projectId }: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const [ drill, setDrill ] = useState< Drill | null >( null );
	const [ groups, setGroups ] =
		useState< Record< GroupKey, GroupState > >( initialGroups );
	const [ drillState, setDrillState ] = useState< GroupState >( {
		status: 'loading',
	} );

	useEffect( () => {
		setDrill( null );
		setQuery( '' );
	}, [ projectId ] );

	useEffect( () => {
		if ( drill !== null ) {
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
	}, [ projectId, drill ] );

	useEffect( () => {
		if ( drill === null ) {
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
	}, [ projectId, drill ] );

	const normalizedQuery = query.trim().toLowerCase();
	const isFiltering = normalizedQuery.length > 0;

	const openFolder = ( groupKey: GroupKey, name: string ): void => {
		const nextParts = drill?.groupKey === groupKey ? drill.parts : [];
		setDrill( { groupKey, parts: [ ...nextParts, name ] } );
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

			{ drill !== null && (
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

			{ drill === null &&
				GROUPS.map( ( group ) => {
					const state = groups[ group.key ];
					const allFiles =
						state.status === 'loaded' ? state.files : [];
					const visibleFiles = isFiltering
						? allFiles.filter( ( f ) =>
								f.name.toLowerCase().includes( normalizedQuery )
						  )
						: allFiles;
					const count =
						state.status === 'loaded' ? visibleFiles.length : null;
					if ( isFiltering && visibleFiles.length === 0 ) {
						return null;
					}
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
								visibleFiles.length === 0 && (
									<div className="resources-grid-hint">
										No { group.label.toLowerCase() } yet
									</div>
								) }
							{ state.status === 'loaded' &&
								visibleFiles.length > 0 && (
									<div className="resources-grid-cards">
										{ visibleFiles.map( ( file ) =>
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

			{ drill !== null && (
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
						( () => {
							const visibleFiles = isFiltering
								? drillState.files.filter( ( f ) =>
										f.name
											.toLowerCase()
											.includes( normalizedQuery )
								  )
								: drillState.files;
							if ( visibleFiles.length === 0 ) {
								return (
									<div className="resources-grid-hint">
										{ isFiltering
											? 'No matches'
											: 'Folder is empty' }
									</div>
								);
							}
							return (
								<div className="resources-grid-cards">
									{ visibleFiles.map( ( file ) =>
										renderCard( {
											file,
											testIdPrefix:
												'resources-card-drill',
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
							);
						} )() }
				</section>
			) }
		</div>
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
