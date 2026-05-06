import React, { useEffect, useRef, useState } from 'react';

import type {
	DirEntry,
	Drill,
	ResourcesViewState,
	SearchHit,
} from '../../types';

import { DeleteResourceDialog } from './DeleteResourceDialog';
import { ResourceActionMenu } from './ResourceActionMenu';
import { ChevronIcon } from '../icons';
import { isMarkdown, isPreviewable } from '../lib/previewKind';
import { relativeDate } from '../lib/relativeDate';

type GroupKey = 'sources' | 'drafts' | 'published';

type GroupSpec = {
	key: GroupKey;
	label: string;
	folder: string;
};

const GROUPS: GroupSpec[] = [
	{ key: 'sources', label: 'Sources', folder: 'sources' },
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

type GroupState =
	| { status: 'loading' }
	| { status: 'loaded'; files: DirEntry[] }
	| { status: 'error' };

type SearchState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded'; hits: SearchHit[] }
	| { status: 'error' };

type Props = {
	projectId: string;
	// Search query and drill state, lifted into App so the preview round-trip
	// (open file → click Back) returns the user to the same view they left.
	// Scroll position lives in the same view state but is restored by the
	// parent on the shared `.resources-area-list` scroll container.
	viewState: ResourcesViewState;
	onViewStateChange: ( patch: Partial< ResourcesViewState > ) => void;
	// Fired when the user clicks a previewable card body. `relPath` is the
	// path inside `<folder>/` (e.g. `foo.md` or `2026-04/foo.md`); resolve
	// as `<project>/<folder>/<relPath>`. Markdown is the only previewable
	// type today — non-markdown cards render inert.
	onPreviewFile?: ( folder: GroupKey, relPath: string, name: string ) => void;
	// Fired when the user picks "Add to chat" from a resource card's action
	// menu. The grid only forwards the click; the parent decides what to
	// stage. Disabled (via `addToChatDisabled`) when there's no active chat.
	onAddToChat?: ( folder: GroupKey, relPath: string, name: string ) => void;
	// Fired when the user picks "Open new chat" from a resource card's
	// action menu.
	onOpenNewChat?: ( folder: GroupKey, relPath: string, name: string ) => void;
	// True when "Add to chat" should render disabled — the parent flips it
	// based on whether the project has an active chat to attach to.
	addToChatDisabled?: boolean;
	// Fired when the user picks "Edit" from a draft card's action menu.
	onEditDraft?: ( relPath: string, name: string ) => void;
	// Fired after the user confirms deletion of a resource. The grid handles
	// the actual file removal + local refresh; this hook lets the parent clear
	// any related state (e.g. a preview pinned to the deleted file).
	onResourceDeleted?: (
		folder: GroupKey,
		relPath: string,
		name: string
	) => void;
};

type PendingDeletion = {
	groupKey: GroupKey;
	relPath: string;
	name: string;
};

const initialGroups = (): Record< GroupKey, GroupState > => ( {
	sources: { status: 'loading' },
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
	viewState,
	onViewStateChange,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onEditDraft,
	onResourceDeleted,
}: Props ): React.ReactElement {
	const { query, drill } = viewState;
	const setQuery = ( next: string ): void => {
		onViewStateChange( { query: next } );
	};
	const setDrill = ( next: Drill | null ): void => {
		onViewStateChange( { drill: next } );
	};
	// Identifier of the draft card whose action menu is currently open
	// (`<group>:<relPath>`). Null when no menu is open. Stored at the grid
	// level so opening another card's menu auto-closes the previous one.
	const [ openMenuId, setOpenMenuId ] = useState< string | null >( null );
	const menuRef = useRef< HTMLDivElement | null >( null );
	const [ pendingDeletion, setPendingDeletion ] =
		useState< PendingDeletion | null >( null );
	const [ deleting, setDeleting ] = useState( false );
	// Bumped after a successful delete so the list-loading effects re-run
	// without remounting (which would lose drill state and the search query).
	const [ refreshTick, setRefreshTick ] = useState( 0 );

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
	}, [ projectId, drill, isSearching, refreshTick ] );

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
	}, [ projectId, drill, isSearching, refreshTick ] );

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
	}, [ projectId, query, isSearching, refreshTick ] );

	const requestDelete = (
		groupKey: GroupKey,
		relPath: string,
		name: string
	): void => {
		setPendingDeletion( { groupKey, relPath, name } );
	};

	const confirmDelete = async (): Promise< void > => {
		if ( ! pendingDeletion || deleting ) {
			return;
		}
		setDeleting( true );
		try {
			const folder = groupForKey( pendingDeletion.groupKey ).folder as
				| 'sources'
				| 'drafts'
				| 'published';
			const result = await window.api.resources.delete(
				projectId,
				folder,
				pendingDeletion.relPath
			);
			if ( ! result.ok ) {
				return;
			}
			onResourceDeleted?.(
				pendingDeletion.groupKey,
				pendingDeletion.relPath,
				pendingDeletion.name
			);
			setPendingDeletion( null );
			setRefreshTick( ( n ) => n + 1 );
		} finally {
			setDeleting( false );
		}
	};

	const cancelDelete = (): void => {
		if ( deleting ) {
			return;
		}
		setPendingDeletion( null );
	};

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
					onPreviewFile,
					onAddToChat,
					onOpenNewChat,
					addToChatDisabled,
					onEditDraft,
					onRequestDelete: requestDelete,
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
													const isFile =
														! file.isDirectory;
													const canPreview =
														isFile &&
														isPreviewable(
															file.name
														);
													const isDraftFile =
														group.key ===
															'drafts' &&
														isFile &&
														isMarkdown( file.name );
													const menuId = `${ group.key }:${ file.name }`;
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
																onPreviewFile:
																	canPreview
																		? () =>
																				onPreviewFile?.(
																					group.key,
																					file.name,
																					file.name
																				)
																		: undefined,
																onAddToChat:
																	isFile
																		? () =>
																				onAddToChat?.(
																					group.key,
																					file.name,
																					file.name
																				)
																		: undefined,
																onOpenNewChat:
																	isFile
																		? () =>
																				onOpenNewChat?.(
																					group.key,
																					file.name,
																					file.name
																				)
																		: undefined,
																addToChatDisabled,
																onEditDraft:
																	isDraftFile
																		? () =>
																				onEditDraft?.(
																					file.name,
																					file.name
																				)
																		: undefined,
																onDelete: () =>
																	requestDelete(
																		group.key,
																		file.name,
																		file.name
																	),
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
									const isFile = ! file.isDirectory;
									const canPreview =
										isFile && isPreviewable( file.name );
									const isDraftFile =
										drill.groupKey === 'drafts' &&
										isFile &&
										isMarkdown( file.name );
									const relPath = [
										...drill.parts,
										file.name,
									].join( '/' );
									const menuId = `drill:${ relPath }`;
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
												onPreviewFile: canPreview
													? () =>
															onPreviewFile?.(
																drill.groupKey,
																relPath,
																file.name
															)
													: undefined,
												onAddToChat: isFile
													? () =>
															onAddToChat?.(
																drill.groupKey,
																relPath,
																file.name
															)
													: undefined,
												onOpenNewChat: isFile
													? () =>
															onOpenNewChat?.(
																drill.groupKey,
																relPath,
																file.name
															)
													: undefined,
												addToChatDisabled,
												onEditDraft: isDraftFile
													? () =>
															onEditDraft?.(
																relPath,
																file.name
															)
													: undefined,
												onDelete: () =>
													requestDelete(
														drill.groupKey,
														relPath,
														file.name
													),
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
			<DeleteResourceDialog
				pending={ pendingDeletion }
				deleting={ deleting }
				onConfirm={ () => {
					void confirmDelete();
				} }
				onCancel={ cancelDelete }
			/>
		</div>
	);
}

function renderSearchResults( {
	searchState,
	onOpenHit,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onEditDraft,
	onRequestDelete,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	searchState: SearchState;
	onOpenHit: ( hit: SearchHit ) => void;
	onPreviewFile?: ( folder: GroupKey, relPath: string, name: string ) => void;
	onAddToChat?: ( folder: GroupKey, relPath: string, name: string ) => void;
	onOpenNewChat?: ( folder: GroupKey, relPath: string, name: string ) => void;
	addToChatDisabled?: boolean;
	onEditDraft?: ( relPath: string, name: string ) => void;
	onRequestDelete: (
		groupKey: GroupKey,
		relPath: string,
		name: string
	) => void;
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
								const isFile = ! hit.isDirectory;
								const canPreview =
									isFile && isPreviewable( hit.name );
								const isDraftFile =
									group.key === 'drafts' &&
									isFile &&
									isMarkdown( hit.name );
								const menuId = `search:${ group.key }:${ hit.relPath }`;
								return (
									<React.Fragment
										key={ `${ hit.folder }/${ hit.relPath }` }
									>
										{ renderHitCard( {
											hit,
											groupKey: group.key,
											onOpenFolder: () =>
												onOpenHit( hit ),
											onPreviewFile: canPreview
												? () =>
														onPreviewFile?.(
															group.key,
															hit.relPath,
															hit.name
														)
												: undefined,
											onAddToChat: isFile
												? () =>
														onAddToChat?.(
															group.key,
															hit.relPath,
															hit.name
														)
												: undefined,
											onOpenNewChat: isFile
												? () =>
														onOpenNewChat?.(
															group.key,
															hit.relPath,
															hit.name
														)
												: undefined,
											addToChatDisabled,
											onEditDraft: isDraftFile
												? () =>
														onEditDraft?.(
															hit.relPath,
															hit.name
														)
												: undefined,
											onDelete: () =>
												onRequestDelete(
													group.key,
													hit.relPath,
													hit.name
												),
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
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onEditDraft,
	onDelete,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	file: DirEntry;
	testIdPrefix: string;
	onOpenFolder: () => void;
	onPreviewFile?: () => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	addToChatDisabled?: boolean;
	onEditDraft?: () => void;
	onDelete?: () => void;
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
			<span className="resources-grid-card-head">
				<span className="resources-grid-card-name">{ file.name }</span>
			</span>
		</>
	);
	if ( isDir ) {
		return renderFolderCard( {
			testId,
			title: file.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onOpenFolder,
			onDelete,
			body,
		} );
	}
	if ( onPreviewFile && menuId !== null ) {
		return renderPreviewableCard( {
			testId,
			title: file.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onPreviewFile,
			onAddToChat,
			onOpenNewChat,
			addToChatDisabled,
			onEditDraft,
			onDelete,
			body,
		} );
	}
	if ( onDelete && menuId !== null ) {
		return renderFileCard( {
			testId,
			title: file.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onAddToChat,
			onOpenNewChat,
			addToChatDisabled,
			onDelete,
			body,
		} );
	}
	return (
		<article
			className="resources-grid-card"
			data-kind="file"
			data-previewable="false"
			data-testid={ testId }
			title="Preview unavailable for this file type"
		>
			{ body }
		</article>
	);
}

function renderPreviewableCard( {
	testId,
	title,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onEditDraft,
	onDelete,
	body,
}: {
	testId: string;
	title: string;
	menuId: string;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	onPreviewFile: () => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	addToChatDisabled?: boolean;
	onEditDraft?: () => void;
	onDelete?: () => void;
	body: React.ReactNode;
} ): React.ReactElement {
	return (
		<div
			className="resources-grid-card-cell"
			data-testid={ `${ testId }-cell` }
		>
			<button
				type="button"
				className="resources-grid-card"
				data-kind="file"
				data-previewable="true"
				data-testid={ testId }
				onClick={ onPreviewFile }
				title={ `Preview ${ title }` }
			>
				{ body }
			</button>
			<ResourceActionMenu
				menuId={ menuId }
				openMenuId={ openMenuId }
				setOpenMenuId={ setOpenMenuId }
				menuRef={ menuRef }
				buttonTestId={ `${ testId }-menu-button` }
				ariaLabel={ `Actions for ${ title }` }
				onEdit={ onEditDraft }
				onAddToChat={ onAddToChat }
				onOpenNewChat={ onOpenNewChat }
				addToChatDisabled={ addToChatDisabled }
				onDelete={ onDelete }
			/>
		</div>
	);
}

function renderFolderCard( {
	testId,
	title,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	onOpenFolder,
	onDelete,
	body,
}: {
	testId: string;
	title: string;
	menuId: string | null;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	onOpenFolder: () => void;
	onDelete?: () => void;
	body: React.ReactNode;
} ): React.ReactElement {
	const folderButton = (
		<button
			type="button"
			className="resources-grid-card"
			data-kind="dir"
			data-testid={ testId }
			onClick={ onOpenFolder }
			title={ `Open ${ title }` }
		>
			{ body }
		</button>
	);
	if ( ! onDelete || menuId === null ) {
		return folderButton;
	}
	return (
		<div
			className="resources-grid-card-cell"
			data-testid={ `${ testId }-cell` }
		>
			{ folderButton }
			<ResourceActionMenu
				menuId={ menuId }
				openMenuId={ openMenuId }
				setOpenMenuId={ setOpenMenuId }
				menuRef={ menuRef }
				buttonTestId={ `${ testId }-menu-button` }
				ariaLabel={ `Actions for ${ title }` }
				onDelete={ onDelete }
			/>
		</div>
	);
}

function renderFileCard( {
	testId,
	title,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onDelete,
	body,
}: {
	testId: string;
	title: string;
	menuId: string;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	addToChatDisabled?: boolean;
	onDelete: () => void;
	body: React.ReactNode;
} ): React.ReactElement {
	return (
		<div
			className="resources-grid-card-cell"
			data-testid={ `${ testId }-cell` }
		>
			<article
				className="resources-grid-card"
				data-kind="file"
				data-previewable="false"
				data-testid={ testId }
				title="Preview unavailable for this file type"
			>
				{ body }
			</article>
			<ResourceActionMenu
				menuId={ menuId }
				openMenuId={ openMenuId }
				setOpenMenuId={ setOpenMenuId }
				menuRef={ menuRef }
				buttonTestId={ `${ testId }-menu-button` }
				ariaLabel={ `Actions for ${ title }` }
				onAddToChat={ onAddToChat }
				onOpenNewChat={ onOpenNewChat }
				addToChatDisabled={ addToChatDisabled }
				onDelete={ onDelete }
			/>
		</div>
	);
}

function renderHitCard( {
	hit,
	groupKey,
	onOpenFolder,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onEditDraft,
	onDelete,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
}: {
	hit: SearchHit;
	groupKey: GroupKey;
	onOpenFolder: () => void;
	onPreviewFile?: () => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	addToChatDisabled?: boolean;
	onEditDraft?: () => void;
	onDelete?: () => void;
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
		</>
	);
	if ( isDir ) {
		return renderFolderCard( {
			testId,
			title: hit.relPath,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onOpenFolder,
			onDelete,
			body,
		} );
	}
	if ( onPreviewFile && menuId !== null ) {
		return renderPreviewableCard( {
			testId,
			title: hit.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onPreviewFile,
			onAddToChat,
			onOpenNewChat,
			addToChatDisabled,
			onEditDraft,
			onDelete,
			body,
		} );
	}
	if ( onDelete && menuId !== null ) {
		return renderFileCard( {
			testId,
			title: hit.name,
			menuId,
			openMenuId,
			setOpenMenuId,
			menuRef,
			onAddToChat,
			onOpenNewChat,
			addToChatDisabled,
			onDelete,
			body,
		} );
	}
	return (
		<article
			className="resources-grid-card"
			data-kind="file"
			data-previewable="false"
			data-testid={ testId }
			title="Preview unavailable for this file type"
		>
			{ body }
		</article>
	);
}
