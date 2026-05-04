import React, { useEffect, useRef, useState } from 'react';

import type { DirEntry, SearchHit } from '../../types';

import { ChevronIcon, MoreIcon } from '../icons';
import { relativeDate } from '../lib/relativeDate';

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

function fileExtension( name: string ): string {
	const dot = name.lastIndexOf( '.' );
	if ( dot <= 0 || dot === name.length - 1 ) {
		return '';
	}
	return name.slice( dot + 1 ).toLowerCase();
}

function isMarkdown( name: string ): boolean {
	return fileExtension( name ) === 'md';
}

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
	// Fired when the user clicks a draft card body. `relPath` is the path
	// inside the `drafts/` folder (e.g. `foo.md` or `2026-04/foo.md`);
	// resolve it as `<project>/drafts/<relPath>`. Opens the draft preview in
	// the resources area without touching chats. Other groups stay inert —
	// drafts are the only "open" surface today.
	onPreviewDraft?: ( relPath: string, name: string ) => void;
	// Fired when the user picks "Chat" from a draft card's action menu.
	onChatDraft?: ( relPath: string, name: string ) => void;
	// Fired when the user picks "Edit" from a draft card's action menu.
	onEditDraft?: ( relPath: string, name: string ) => void;
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

export function ResourcesGrid( {
	projectId,
	onPreviewDraft,
	onChatDraft,
	onEditDraft,
}: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const [ drill, setDrill ] = useState< Drill | null >( null );
	// Identifier of the draft card whose action menu is currently open
	// (`<group>:<relPath>`). Null when no menu is open. Stored at the grid
	// level so opening another card's menu auto-closes the previous one.
	const [ openMenuId, setOpenMenuId ] = useState< string | null >( null );
	const menuRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		setOpenMenuId( null );
	}, [ projectId ] );

	useEffect( () => {
		if ( ! openMenuId ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setOpenMenuId( null );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				menuRef.current &&
				! menuRef.current.contains( e.target as Node )
			) {
				setOpenMenuId( null );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ openMenuId ] );

	const [ groups, setGroups ] =
		useState< Record< GroupKey, GroupState > >( initialGroups );
	const [ drillState, setDrillState ] = useState< GroupState >( {
		status: 'loading',
	} );
	const [ searchState, setSearchState ] = useState< SearchState >( {
		status: 'idle',
	} );
	const [ collapsed, setCollapsed ] = useState< Record< GroupKey, boolean > >(
		{} as Record< GroupKey, boolean >
	);

	useEffect( () => {
		setDrill( null );
		setQuery( '' );
	}, [ projectId ] );

	// Hydrate per-project collapse state. Default is collapsed — unset keys
	// read as `true` here so first-time visitors see a compact panel and can
	// open the sections they care about.
	useEffect( () => {
		let cancelled = false;
		const allCollapsed: Record< GroupKey, boolean > = {} as Record<
			GroupKey,
			boolean
		>;
		for ( const group of GROUPS ) {
			allCollapsed[ group.key ] = true;
		}
		setCollapsed( allCollapsed );
		void window.api.project.uiPrefs
			.get( projectId )
			.then( ( prefs ) => {
				if ( cancelled ) {
					return;
				}
				const next: Record< GroupKey, boolean > = {} as Record<
					GroupKey,
					boolean
				>;
				for ( const group of GROUPS ) {
					const stored = prefs.resourcesCollapsed[ group.key ];
					next[ group.key ] =
						typeof stored === 'boolean' ? stored : true;
				}
				setCollapsed( next );
			} )
			.catch( () => {
				/* fall back to all-collapsed */
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	const toggleCollapsed = ( key: GroupKey ): void => {
		setCollapsed( ( prev ) => {
			const next = { ...prev, [ key ]: ! prev[ key ] };
			// Send the full map, not just the toggled key. Two rapid toggles
			// fire two saves; the main-side store reads the file before each
			// write, so a per-key diff lets the later write clobber the
			// earlier one if their reads interleave. Sending the full map
			// makes the latest send authoritative regardless of order.
			void window.api.project.uiPrefs.set( projectId, {
				resourcesCollapsed: next,
			} );
			return next;
		} );
	};

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
		if ( hit.isDirectory ) {
			setDrill( { groupKey, parts: hit.relPath.split( '/' ) } );
			setQuery( '' );
		}
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
					onPreviewDraft,
					onChatDraft,
					onEditDraft,
					openMenuId,
					setOpenMenuId,
					menuRef,
				} ) }

			{ ! isSearching &&
				drill === null &&
				GROUPS.map( ( group ) => {
					const state = groups[ group.key ];
					const files = state.status === 'loaded' ? state.files : [];
					const count =
						state.status === 'loaded' ? files.length : null;
					const isCollapsed = collapsed[ group.key ] === true;
					const bodyId = `resources-group-body-${ group.key }`;
					return (
						<section
							key={ group.key }
							className="resources-grid-group"
							data-testid={ `resources-group-${ group.key }` }
							data-collapsed={ isCollapsed ? 'true' : 'false' }
						>
							<header className="resources-grid-group-header">
								<button
									type="button"
									className="resources-grid-group-chevron"
									data-testid={ `resources-group-collapse-${ group.key }` }
									aria-expanded={ ! isCollapsed }
									aria-controls={ bodyId }
									aria-label={
										isCollapsed
											? `Expand ${ group.label }`
											: `Collapse ${ group.label }`
									}
									onClick={ () =>
										toggleCollapsed( group.key )
									}
								>
									<ChevronIcon size={ 14 } />
								</button>
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
							{ ! isCollapsed && (
								<div id={ bodyId }>
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
												No { group.label.toLowerCase() }{ ' ' }
												yet
											</div>
										) }
									{ state.status === 'loaded' &&
										files.length > 0 && (
											<div className="resources-grid-cards">
												{ files.map( ( file ) => {
													const isDraft =
														group.key ===
															'drafts' &&
														! file.isDirectory &&
														isMarkdown( file.name );
													const menuId = isDraft
														? `${ group.key }:${ file.name }`
														: null;
													return (
														<React.Fragment
															key={ file.name }
														>
															{ renderCard( {
																file,
																testIdPrefix: `resources-card-${ group.key }`,
																onOpenFolder:
																	() =>
																		openFolder(
																			group.key,
																			file.name
																		),
																onPreviewDraft:
																	isDraft
																		? () =>
																				onPreviewDraft?.(
																					file.name,
																					file.name
																				)
																		: undefined,
																onChatDraft:
																	isDraft
																		? () =>
																				onChatDraft?.(
																					file.name,
																					file.name
																				)
																		: undefined,
																onEditDraft:
																	isDraft
																		? () =>
																				onEditDraft?.(
																					file.name,
																					file.name
																				)
																		: undefined,
																menuId,
																openMenuId,
																setOpenMenuId,
																menuRef,
															} ) }
														</React.Fragment>
													);
												} ) }
											</div>
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
								{ drillState.files.map( ( file ) => {
									const isDraft =
										drill.groupKey === 'drafts' &&
										! file.isDirectory &&
										isMarkdown( file.name );
									const relPath = [
										...drill.parts,
										file.name,
									].join( '/' );
									const menuId = isDraft
										? `drill:${ relPath }`
										: null;
									return (
										<React.Fragment key={ file.name }>
											{ renderCard( {
												file,
												testIdPrefix:
													'resources-card-drill',
												onOpenFolder: () =>
													setDrill( {
														groupKey:
															drill.groupKey,
														parts: [
															...drill.parts,
															file.name,
														],
													} ),
												onPreviewDraft: isDraft
													? () =>
															onPreviewDraft?.(
																relPath,
																file.name
															)
													: undefined,
												onChatDraft: isDraft
													? () =>
															onChatDraft?.(
																relPath,
																file.name
															)
													: undefined,
												onEditDraft: isDraft
													? () =>
															onEditDraft?.(
																relPath,
																file.name
															)
													: undefined,
												menuId,
												openMenuId,
												setOpenMenuId,
												menuRef,
											} ) }
										</React.Fragment>
									);
								} ) }
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
	onPreviewDraft,
	onChatDraft,
	onEditDraft,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	searchState: SearchState;
	onOpenHit: ( hit: SearchHit ) => void;
	onPreviewDraft?: ( relPath: string, name: string ) => void;
	onChatDraft?: ( relPath: string, name: string ) => void;
	onEditDraft?: ( relPath: string, name: string ) => void;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
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
							{ hits.map( ( hit ) => {
								const isDraft =
									group.key === 'drafts' &&
									! hit.isDirectory &&
									isMarkdown( hit.name );
								const menuId = isDraft
									? `search:${ group.key }:${ hit.relPath }`
									: null;
								return (
									<React.Fragment
										key={ `${ hit.folder }/${ hit.relPath }` }
									>
										{ renderHitCard( {
											hit,
											groupKey: group.key,
											onOpenFolder: () =>
												onOpenHit( hit ),
											onPreviewDraft: isDraft
												? () =>
														onPreviewDraft?.(
															hit.relPath,
															hit.name
														)
												: undefined,
											onChatDraft: isDraft
												? () =>
														onChatDraft?.(
															hit.relPath,
															hit.name
														)
												: undefined,
											onEditDraft: isDraft
												? () =>
														onEditDraft?.(
															hit.relPath,
															hit.name
														)
												: undefined,
											menuId,
											openMenuId,
											setOpenMenuId,
											menuRef,
										} ) }
									</React.Fragment>
								);
							} ) }
						</div>
					</section>
				);
			} ) }
		</>
	);
}

function fileKindLabel( name: string ): string {
	const ext = fileExtension( name );
	if ( ext ) {
		return `.${ ext }`;
	}
	return 'File';
}

function renderCard( {
	file,
	testIdPrefix,
	onOpenFolder,
	onPreviewDraft,
	onChatDraft,
	onEditDraft,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	file: DirEntry;
	testIdPrefix: string;
	onOpenFolder: () => void;
	onPreviewDraft?: () => void;
	onChatDraft?: () => void;
	onEditDraft?: () => void;
	menuId: string | null;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
} ): React.ReactElement {
	const testId = `${ testIdPrefix }-${ file.name }`;
	const isDir = file.isDirectory;
	const date =
		! isDir && file.mtime !== undefined ? relativeDate( file.mtime ) : null;
	const kind = isDir ? 'Folder' : fileKindLabel( file.name );
	const body = (
		<>
			<span className="resources-grid-card-head">
				<span className="resources-grid-card-name">{ file.name }</span>
			</span>
			<span className="resources-grid-card-meta">
				<span className="resources-grid-card-kind">{ kind }</span>
				{ date && (
					<span className="resources-grid-card-date">{ date }</span>
				) }
				{ isDir && (
					<span
						className="resources-grid-card-affordance"
						aria-hidden="true"
					>
						›
					</span>
				) }
			</span>
		</>
	);
	if ( isDir ) {
		return (
			<button
				type="button"
				className="resources-grid-card"
				data-kind="dir"
				data-testid={ testId }
				onClick={ onOpenFolder }
				title={ `Open ${ file.name }` }
			>
				{ body }
			</button>
		);
	}
	if ( onPreviewDraft && menuId !== null ) {
		return renderDraftCard( {
			testId,
			title: file.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onPreviewDraft,
			onChatDraft,
			onEditDraft,
			body,
		} );
	}
	return (
		<article
			className="resources-grid-card"
			data-kind="file"
			data-testid={ testId }
		>
			{ body }
		</article>
	);
}

function renderDraftCard( {
	testId,
	title,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	onPreviewDraft,
	onChatDraft,
	onEditDraft,
	body,
}: {
	testId: string;
	title: string;
	menuId: string;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	onPreviewDraft: () => void;
	onChatDraft?: () => void;
	onEditDraft?: () => void;
	body: React.ReactNode;
} ): React.ReactElement {
	const isOpen = openMenuId === menuId;
	return (
		<div
			className="resources-grid-card-cell"
			data-testid={ `${ testId }-cell` }
		>
			<button
				type="button"
				className="resources-grid-card"
				data-kind="file"
				data-testid={ testId }
				onClick={ onPreviewDraft }
				title={ `Preview ${ title }` }
			>
				{ body }
			</button>
			<button
				type="button"
				className="resources-grid-card-menu-button"
				data-testid={ `${ testId }-menu-button` }
				aria-haspopup="menu"
				aria-expanded={ isOpen }
				aria-label={ `Actions for ${ title }` }
				onClick={ ( e ) => {
					e.stopPropagation();
					setOpenMenuId( isOpen ? null : menuId );
				} }
			>
				<MoreIcon size={ 14 } />
			</button>
			{ isOpen && (
				<div
					ref={ menuRef }
					className="resources-grid-card-menu"
					data-testid="draft-action-menu"
					role="menu"
				>
					<button
						type="button"
						className="resources-grid-card-menu-item"
						data-testid="draft-action-edit"
						role="menuitem"
						onClick={ ( e ) => {
							e.stopPropagation();
							setOpenMenuId( null );
							onEditDraft?.();
						} }
					>
						Edit
					</button>
					<button
						type="button"
						className="resources-grid-card-menu-item"
						data-testid="draft-action-chat"
						role="menuitem"
						onClick={ ( e ) => {
							e.stopPropagation();
							setOpenMenuId( null );
							onChatDraft?.();
						} }
					>
						Chat
					</button>
				</div>
			) }
		</div>
	);
}

function renderHitCard( {
	hit,
	groupKey,
	onOpenFolder,
	onPreviewDraft,
	onChatDraft,
	onEditDraft,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	hit: SearchHit;
	groupKey: GroupKey;
	onOpenFolder: () => void;
	onPreviewDraft?: () => void;
	onChatDraft?: () => void;
	onEditDraft?: () => void;
	menuId: string | null;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
} ): React.ReactElement {
	const parent = parentParts( hit.relPath ).join( '/' );
	const testId = `resources-search-card-${ groupKey }-${ hit.relPath }`;
	const isDir = hit.isDirectory;
	const date =
		! isDir && hit.mtime !== undefined ? relativeDate( hit.mtime ) : null;
	const kind = isDir ? 'Folder' : fileKindLabel( hit.name );
	const body = (
		<>
			<span className="resources-grid-card-head">
				<span className="resources-grid-card-body">
					<span className="resources-grid-card-name">
						{ hit.name }
					</span>
					{ parent && (
						<span className="resources-grid-card-path">
							{ parent }
						</span>
					) }
				</span>
			</span>
			<span className="resources-grid-card-meta">
				<span className="resources-grid-card-kind">{ kind }</span>
				{ date && (
					<span className="resources-grid-card-date">{ date }</span>
				) }
				{ isDir && (
					<span
						className="resources-grid-card-affordance"
						aria-hidden="true"
					>
						›
					</span>
				) }
			</span>
		</>
	);
	if ( isDir ) {
		return (
			<button
				type="button"
				className="resources-grid-card"
				data-kind="dir"
				data-testid={ testId }
				onClick={ onOpenFolder }
				title={ `Open ${ hit.relPath }` }
			>
				{ body }
			</button>
		);
	}
	if ( onPreviewDraft && menuId !== null ) {
		return renderDraftCard( {
			testId,
			title: hit.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onPreviewDraft,
			onChatDraft,
			onEditDraft,
			body,
		} );
	}
	return (
		<article
			className="resources-grid-card"
			data-kind="file"
			data-testid={ testId }
		>
			{ body }
		</article>
	);
}
