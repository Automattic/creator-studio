import React, { useEffect, useRef, useState } from 'react';

import { Menu } from '@base-ui/react/menu';

import type {
	DirEntry,
	Drill,
	FolderTextTile,
	ResourcesShowFilter,
	ResourcesSort,
	ResourcesViewState,
	SearchHit,
} from '../../types';

import { DeleteResourceDialog } from './DeleteResourceDialog';
import { PdfThumbnail } from './PdfThumbnail';
import { ResourceActionMenu } from './ResourceActionMenu';
import { VideoThumbnail } from './VideoThumbnail';
import { ChevronIcon, PlusIcon, SlidersIcon } from '../icons';
import {
	isImage,
	isMarkdown,
	isPdf,
	isPreviewable,
	isText,
	isVideo,
} from '../lib/previewKind';
import { relativeDate } from '../lib/relativeDate';

const DEFAULT_SORT: ResourcesSort = 'recent';

const DEFAULT_SHOW: ResourcesShowFilter = {
	folders: true,
	text: true,
	images: true,
	pdf: true,
	video: true,
	other: true,
};

const SORT_OPTIONS: ReadonlyArray< { value: ResourcesSort; label: string } > = [
	{ value: 'recent', label: 'Recent first' },
	{ value: 'oldest', label: 'Oldest first' },
	{ value: 'name-asc', label: 'Name (A–Z)' },
	{ value: 'name-desc', label: 'Name (Z–A)' },
];

const SHOW_OPTIONS: ReadonlyArray< {
	key: keyof ResourcesShowFilter;
	label: string;
} > = [
	{ key: 'folders', label: 'Folders' },
	{ key: 'text', label: 'Text' },
	{ key: 'images', label: 'Images' },
	{ key: 'pdf', label: 'PDF' },
	{ key: 'video', label: 'Video' },
	{ key: 'other', label: 'Other' },
];

function fileShowKey( name: string ): keyof ResourcesShowFilter {
	if ( isMarkdown( name ) || isText( name ) ) {
		return 'text';
	}
	if ( isImage( name ) ) {
		return 'images';
	}
	if ( isPdf( name ) ) {
		return 'pdf';
	}
	if ( isVideo( name ) ) {
		return 'video';
	}
	return 'other';
}

function passesShowFilter(
	entry: { name: string; isDirectory: boolean },
	show: ResourcesShowFilter
): boolean {
	if ( entry.isDirectory ) {
		return show.folders;
	}
	return show[ fileShowKey( entry.name ) ];
}

function sortEntries( entries: DirEntry[], sort: ResourcesSort ): DirEntry[] {
	const copy = entries.slice();
	copy.sort( ( a, b ) => {
		if ( a.isDirectory !== b.isDirectory ) {
			return a.isDirectory ? -1 : 1;
		}
		switch ( sort ) {
			case 'recent':
			case 'oldest': {
				const aMtime =
					( a.isDirectory ? a.latestChildMtime : a.mtime ) ?? 0;
				const bMtime =
					( b.isDirectory ? b.latestChildMtime : b.mtime ) ?? 0;
				if ( aMtime !== bMtime ) {
					return sort === 'recent'
						? bMtime - aMtime
						: aMtime - bMtime;
				}
				return a.name.localeCompare( b.name );
			}
			case 'name-desc':
				return b.name.localeCompare( a.name );
			case 'name-asc':
			default:
				return a.name.localeCompare( b.name );
		}
	} );
	return copy;
}

type GroupKey = 'sources' | 'drafts' | 'done';

type GroupSpec = {
	key: GroupKey;
	label: string;
	folder: string;
};

const GROUPS: GroupSpec[] = [
	{ key: 'sources', label: 'Sources', folder: 'sources' },
	{ key: 'drafts', label: 'Drafts', folder: 'drafts' },
	{ key: 'done', label: 'Done', folder: 'done' },
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
	// Section-header add affordances: drafts gets a direct-action button,
	// sources gets a small menu (Import URL today; Import file / Add note are
	// stubs).
	onNewDraft?: () => void;
	onImportUrl?: () => void;
};

type PendingDeletion = {
	groupKey: GroupKey;
	relPath: string;
	name: string;
};

const initialGroups = (): Record< GroupKey, GroupState > => ( {
	sources: { status: 'loading' },
	drafts: { status: 'loading' },
	done: { status: 'loading' },
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
	onNewDraft,
	onImportUrl,
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
	const [ sort, setSort ] = useState< ResourcesSort >( DEFAULT_SORT );
	const [ show, setShow ] = useState< ResourcesShowFilter >( {
		...DEFAULT_SHOW,
	} );
	const [ viewOpen, setViewOpen ] = useState( false );
	const viewWrapRef = useRef< HTMLDivElement | null >( null );

	// Hydrate per-project view state (collapse, sort, show). Defaults: groups
	// collapsed, sort by recency, all kinds visible.
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
		setSort( DEFAULT_SORT );
		setShow( { ...DEFAULT_SHOW } );
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
				setSort( prefs.resourcesSort );
				setShow( prefs.resourcesShow );
			} )
			.catch( () => {
				/* fall back to defaults */
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	useEffect( () => {
		if ( ! viewOpen ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setViewOpen( false );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				viewWrapRef.current &&
				! viewWrapRef.current.contains( e.target as Node )
			) {
				setViewOpen( false );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ viewOpen ] );

	const handleSortChange = ( next: ResourcesSort ): void => {
		setSort( next );
		void window.api.project.uiPrefs.set( projectId, {
			resourcesSort: next,
		} );
	};

	const handleShowToggle = ( key: keyof ResourcesShowFilter ): void => {
		setShow( ( prev ) => {
			const next = { ...prev, [ key ]: ! prev[ key ] };
			void window.api.project.uiPrefs.set( projectId, {
				resourcesShow: next,
			} );
			return next;
		} );
	};

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
				| 'done';
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
				<div className="resources-grid-view-wrap" ref={ viewWrapRef }>
					<button
						type="button"
						className="resources-grid-view-button"
						data-testid="resources-view-button"
						aria-label="View options"
						aria-haspopup="menu"
						aria-expanded={ viewOpen }
						title="View options"
						onClick={ () => setViewOpen( ( v ) => ! v ) }
					>
						<SlidersIcon size={ 16 } />
					</button>
					{ viewOpen && (
						<div
							className="resources-grid-view-popover"
							data-testid="resources-view-popover"
							role="menu"
						>
							<div className="resources-grid-view-section-label">
								Sort by
							</div>
							{ SORT_OPTIONS.map( ( option ) => {
								const checked = sort === option.value;
								return (
									<button
										key={ option.value }
										type="button"
										className="resources-grid-view-option"
										data-testid={ `resources-view-sort-${ option.value }` }
										data-checked={
											checked ? 'true' : 'false'
										}
										role="menuitemradio"
										aria-checked={ checked }
										onClick={ () =>
											handleSortChange( option.value )
										}
									>
										<span
											className="resources-grid-view-option-mark"
											aria-hidden="true"
										>
											●
										</span>
										<span>{ option.label }</span>
									</button>
								);
							} ) }
							<div
								className="resources-grid-view-divider"
								role="separator"
							/>
							<div className="resources-grid-view-section-label">
								Show
							</div>
							{ SHOW_OPTIONS.map( ( option ) => {
								const checked = show[ option.key ];
								return (
									<button
										key={ option.key }
										type="button"
										className="resources-grid-view-option"
										data-testid={ `resources-view-show-${ option.key }` }
										data-checked={
											checked ? 'true' : 'false'
										}
										role="menuitemcheckbox"
										aria-checked={ checked }
										onClick={ () =>
											handleShowToggle( option.key )
										}
									>
										<span
											className="resources-grid-view-option-mark"
											aria-hidden="true"
										>
											✓
										</span>
										<span>{ option.label }</span>
									</button>
								);
							} ) }
						</div>
					) }
				</div>
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
					projectId,
					show,
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
					const rawFiles =
						state.status === 'loaded' ? state.files : [];
					const files = sortEntries(
						rawFiles.filter( ( file ) =>
							passesShowFilter( file, show )
						),
						sort
					);
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
								{ group.key === 'drafts' && onNewDraft && (
									<button
										type="button"
										className="resources-grid-group-add"
										data-testid="resources-group-add-drafts"
										aria-label="New draft"
										title="New draft"
										onClick={ onNewDraft }
									>
										<PlusIcon size={ 14 } />
									</button>
								) }
								{ group.key === 'sources' && (
									<Menu.Root>
										<Menu.Trigger
											className="resources-grid-group-add"
											data-testid="resources-group-add-sources"
											aria-label="Add source"
											title="Add source"
										>
											<PlusIcon size={ 14 } />
										</Menu.Trigger>
										<Menu.Portal>
											<Menu.Positioner
												className="menu-positioner"
												side="bottom"
												align="end"
												sideOffset={ 6 }
											>
												<Menu.Popup
													className="menu-popup"
													data-testid="resources-group-add-sources-menu"
												>
													<Menu.Item
														className="menu-item"
														data-testid="resources-group-add-sources-menu-import-url"
														onClick={ () => {
															onImportUrl?.();
														} }
														disabled={
															! onImportUrl
														}
													>
														<span>Import URL</span>
													</Menu.Item>
													<Menu.Item
														className="menu-item"
														data-testid="resources-group-add-sources-menu-import-file"
														disabled
													>
														<span>Import file</span>
													</Menu.Item>
													<Menu.Item
														className="menu-item"
														data-testid="resources-group-add-sources-menu-add-note"
														disabled
													>
														<span>Add note</span>
													</Menu.Item>
												</Menu.Popup>
											</Menu.Positioner>
										</Menu.Portal>
									</Menu.Root>
								) }
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
										files.length === 0 &&
										rawFiles.length === 0 && (
											<div className="resources-grid-hint">
												No { group.label.toLowerCase() }{ ' ' }
												yet
											</div>
										) }
									{ state.status === 'loaded' &&
										files.length === 0 &&
										rawFiles.length > 0 && (
											<div className="resources-grid-hint">
												Nothing matches the current
												filters
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
																projectId,
																folder: group.folder,
																relPath:
																	file.name,
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
						( () => {
							const rawDrillFiles = drillState.files;
							const drillFiles = sortEntries(
								rawDrillFiles.filter( ( file ) =>
									passesShowFilter( file, show )
								),
								sort
							);
							if ( rawDrillFiles.length === 0 ) {
								return (
									<div className="resources-grid-hint">
										Folder is empty
									</div>
								);
							}
							if ( drillFiles.length === 0 ) {
								return (
									<div className="resources-grid-hint">
										Nothing matches the current filters
									</div>
								);
							}
							return (
								<div className="resources-grid-cards">
									{ drillFiles.map( ( file ) => {
										const isFile = ! file.isDirectory;
										const canPreview =
											isFile &&
											isPreviewable( file.name );
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
													projectId,
													folder: groupForKey(
														drill.groupKey
													).folder,
													relPath,
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
							);
						} )() }
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
	projectId,
	show,
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
	projectId: string;
	show: ResourcesShowFilter;
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
	const filteredHits = searchState.hits.filter( ( hit ) =>
		passesShowFilter( hit, show )
	);
	if ( filteredHits.length === 0 ) {
		return (
			<div
				className="resources-grid-hint"
				data-testid="resources-search-empty"
			>
				{ searchState.hits.length === 0
					? 'No matches'
					: 'Nothing matches the current filters' }
			</div>
		);
	}
	const byGroup = new Map< GroupKey, SearchHit[] >();
	for ( const hit of filteredHits ) {
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
											projectId,
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

function renderMarkdownExcerpt( excerpt?: string ): React.ReactNode {
	const trimmed = excerpt?.trim() ?? '';
	if ( trimmed.length === 0 ) {
		return null;
	}
	return <span className="resources-grid-card-excerpt">{ trimmed }</span>;
}

function renderImageThumbnail( {
	projectId,
	folder,
	relPath,
	name,
}: {
	projectId: string;
	folder: string;
	relPath: string;
	name: string;
} ): React.ReactNode {
	if ( ! isImage( name ) ) {
		return null;
	}
	// Reuses the `studio-asset://` protocol that the full-size ImagePreview
	// already serves from. No reload-nonce cache buster: thumbnails don't
	// need to follow agent-driven file rewrites — the side preview does.
	const src = `studio-asset://${ projectId }/${ folder }/${ relPath }`;
	return (
		<img
			className="resources-grid-card-thumb"
			src={ src }
			alt={ name }
			loading="lazy"
			onError={ ( e ) => {
				// Hide the broken-image glyph; card falls back to kind + name.
				( e.currentTarget as HTMLImageElement ).style.display = 'none';
			} }
		/>
	);
}

function renderPdfThumbnail( {
	projectId,
	folder,
	relPath,
	name,
	mtime,
	thumbPath,
}: {
	projectId: string;
	folder: string;
	relPath: string;
	name: string;
	mtime: number | undefined;
	thumbPath?: string;
} ): React.ReactNode {
	if ( ! isPdf( name ) ) {
		return null;
	}
	return (
		<PdfThumbnail
			projectId={ projectId }
			folder={ folder }
			relPath={ relPath }
			name={ name }
			mtime={ mtime }
			existingThumbPath={ thumbPath }
		/>
	);
}

function renderVideoThumbnail( {
	projectId,
	folder,
	relPath,
	name,
	mtime,
	thumbPath,
}: {
	projectId: string;
	folder: string;
	relPath: string;
	name: string;
	mtime: number | undefined;
	thumbPath?: string;
} ): React.ReactNode {
	if ( ! isVideo( name ) ) {
		return null;
	}
	return (
		<VideoThumbnail
			projectId={ projectId }
			folder={ folder }
			relPath={ relPath }
			name={ name }
			mtime={ mtime }
			existingThumbPath={ thumbPath }
		/>
	);
}

function folderKindLabel( count: number | undefined ): string {
	if ( count === undefined ) {
		return 'Folder';
	}
	if ( count === 1 ) {
		return '1 item';
	}
	return `${ count } items`;
}

function renderFolderThumbStack( {
	projectId,
	thumbPaths,
}: {
	projectId: string;
	thumbPaths: string[] | undefined;
} ): React.ReactNode {
	if ( ! thumbPaths || thumbPaths.length === 0 ) {
		return null;
	}
	// Backend hands these back newest-first, but the topmost tile in the
	// CSS stack is the *last* DOM child (highest z-index). Reversing here
	// keeps "newest is on top" without coupling the data shape to layout.
	const ordered = thumbPaths.slice().reverse();
	return (
		<span
			className="resources-grid-card-folder-stack"
			data-tile-count={ ordered.length }
			aria-hidden="true"
		>
			{ ordered.map( ( p ) => (
				<img
					key={ p }
					className="resources-grid-card-folder-stack-tile"
					src={ `studio-asset://${ projectId }/${ p }` }
					alt=""
					loading="lazy"
					onError={ ( e ) => {
						( e.currentTarget as HTMLImageElement ).style.display =
							'none';
					} }
				/>
			) ) }
		</span>
	);
}

function renderFolderTextStack( {
	tiles,
}: {
	tiles: FolderTextTile[] | undefined;
} ): React.ReactNode {
	if ( ! tiles || tiles.length === 0 ) {
		return null;
	}
	// Same back-to-front DOM ordering rule as the thumb stack: last child
	// is the topmost tile.
	const ordered = tiles.slice().reverse();
	return (
		<span
			className="resources-grid-card-folder-stack"
			data-tile-count={ ordered.length }
			aria-hidden="true"
		>
			{ ordered.map( ( tile, i ) => (
				<span
					key={ `${ i }-${ tile.title }` }
					className="resources-grid-card-folder-stack-tile resources-grid-card-folder-stack-tile-text"
				>
					<span className="resources-grid-card-folder-stack-tile-title">
						{ tile.title }
					</span>
					{ tile.excerpt && (
						<span className="resources-grid-card-folder-stack-tile-excerpt">
							{ tile.excerpt }
						</span>
					) }
				</span>
			) ) }
		</span>
	);
}

function renderCard( {
	file,
	testIdPrefix,
	projectId,
	folder,
	relPath,
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
	projectId: string;
	folder: string;
	relPath: string;
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
	const dateMtime = isDir ? file.latestChildMtime : file.mtime;
	const date = dateMtime !== undefined ? relativeDate( dateMtime ) : null;
	const kind = isDir
		? folderKindLabel( file.entryCount )
		: fileKindLabel( file.name );
	const body = (
		<>
			<span className="resources-grid-card-meta">
				<span className="resources-grid-card-kind">{ kind }</span>
				{ isDir && (
					<span
						className="resources-grid-card-affordance"
						aria-hidden="true"
					>
						›
					</span>
				) }
				{ date && (
					<span className="resources-grid-card-date">{ date }</span>
				) }
			</span>
			<span className="resources-grid-card-head">
				<span className="resources-grid-card-name">{ file.name }</span>
			</span>
			{ ! isDir && renderMarkdownExcerpt( file.excerpt ) }
			{ ! isDir &&
				renderImageThumbnail( {
					projectId,
					folder,
					relPath,
					name: file.name,
				} ) }
			{ ! isDir &&
				renderPdfThumbnail( {
					projectId,
					folder,
					relPath,
					name: file.name,
					mtime: file.mtime,
					thumbPath: file.thumbPath,
				} ) }
			{ ! isDir &&
				renderVideoThumbnail( {
					projectId,
					folder,
					relPath,
					name: file.name,
					mtime: file.mtime,
					thumbPath: file.thumbPath,
				} ) }
			{ isDir &&
				( file.childThumbPaths && file.childThumbPaths.length > 0
					? renderFolderThumbStack( {
							projectId,
							thumbPaths: file.childThumbPaths,
					  } )
					: renderFolderTextStack( {
							tiles: file.childTextTiles,
					  } ) ) }
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
	projectId,
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
	projectId: string;
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
	const testId = `resources-search-card-${ groupKey }-${ hit.relPath }`;
	const isDir = hit.isDirectory;
	const date =
		! isDir && hit.mtime !== undefined ? relativeDate( hit.mtime ) : null;
	const kind = isDir ? 'Folder' : fileKindLabel( hit.name );
	const body = (
		<>
			<span className="resources-grid-card-meta">
				<span className="resources-grid-card-kind">{ kind }</span>
				{ isDir && (
					<span
						className="resources-grid-card-affordance"
						aria-hidden="true"
					>
						›
					</span>
				) }
				{ date && (
					<span className="resources-grid-card-date">{ date }</span>
				) }
			</span>
			<span className="resources-grid-card-head">
				<span className="resources-grid-card-name">{ hit.name }</span>
			</span>
			{ ! isDir && renderMarkdownExcerpt( hit.excerpt ) }
			{ ! isDir &&
				renderImageThumbnail( {
					projectId,
					folder: groupForKey( groupKey ).folder,
					relPath: hit.relPath,
					name: hit.name,
				} ) }
			{ ! isDir &&
				renderPdfThumbnail( {
					projectId,
					folder: groupForKey( groupKey ).folder,
					relPath: hit.relPath,
					name: hit.name,
					mtime: hit.mtime,
					thumbPath: hit.thumbPath,
				} ) }
			{ ! isDir &&
				renderVideoThumbnail( {
					projectId,
					folder: groupForKey( groupKey ).folder,
					relPath: hit.relPath,
					name: hit.name,
					mtime: hit.mtime,
					thumbPath: hit.thumbPath,
				} ) }
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
