import React, { useEffect, useRef, useState } from 'react';

import { Menu } from '@base-ui/react/menu';

import type {
	DirEntry,
	Drill,
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

type GroupKey = 'sources' | 'drafts' | 'done' | 'checks';

type GroupSpec = {
	key: GroupKey;
	label: string;
	folder: string;
};

const GROUPS: GroupSpec[] = [
	{ key: 'sources', label: 'Sources', folder: 'sources' },
	{ key: 'drafts', label: 'Drafts', folder: 'drafts' },
	{ key: 'done', label: 'Done', folder: 'done' },
	{ key: 'checks', label: 'Checks', folder: 'checks' },
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

// "Recent" = within the last 30 days. Older mtimes still show up in the
// `M d` form via relativeDate, but at card scale they're not useful — past
// a month the exact day stops carrying signal and the meta row just adds
// visual weight.
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isRecent( mtime: number | undefined ): boolean {
	if ( mtime === undefined ) {
		return false;
	}
	return Date.now() - mtime < RECENT_WINDOW_MS;
}

// A note is "untitled" when its filename or frontmatter title is the
// generic `Untitled` placeholder (with or without a trailing index or .md
// extension). These cards get a muted italic treatment so the eye skips
// past them as drafts rather than parsing them as named files.
const UNTITLED_RE = /^Untitled(?:[-\s]*\d*)?(?:\.md)?$/i;

function isUntitled( name: string ): boolean {
	return UNTITLED_RE.test( name.trim() );
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
	// `isDirectory` is true when the card represents a folder; the parent
	// is expected to stage it as a folder-attachment.
	onAddToChat?: (
		folder: GroupKey,
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
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
	// Section-header add affordances: checks gets a direct-action button,
	// sources gets a small menu (Import URL, Import file, Add note, Create
	// folder). The menu also appears on the folder header inside a drill;
	// callers receive the active subPath so the new item lands in the folder
	// the user is currently looking at. Drafts no longer has an inline +
	// button — "New draft" lives in the project titlebar.
	onNewCheck?: () => void;
	onImportUrl?: ( subPath: string ) => void;
	onImportFile?: ( subPath: string ) => void;
	onAddNote?: ( subPath: string ) => void;
	onCreateFolder?: ( parentSubPath: string ) => void;
	// Bumped by the parent after a source is added (note created or file
	// imported) so the SOURCES list reloads without losing drill state or
	// the current search query.
	sourcesRefreshSignal?: number;
	// Fired when an internal drag (cards from this grid) is dropped on a
	// folder card. Cross-group drops are rejected in the grid before this
	// fires, so all items are guaranteed to share the destination group.
	onMoveResources?: (
		items: Array< {
			folder: GroupKey;
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >,
		destFolder: GroupKey,
		destSubPath: string
	) => void;
	// Fired when OS files are dropped on a folder card or on the grid area.
	// `destSubPath` is the destination directory relative to the project
	// root (e.g. "sources" or "sources/Logs"). The parent is responsible for
	// path-extracting the File objects via webUtils.getPathForFile and
	// kicking off the IPC import.
	onDropOsFiles?: (
		files: File[],
		destFolder: GroupKey,
		destSubPath: string
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
	done: { status: 'loading' },
	checks: { status: 'loading' },
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
	onNewCheck,
	onImportUrl,
	onImportFile,
	onAddNote,
	onCreateFolder,
	sourcesRefreshSignal = 0,
	onMoveResources,
	onDropOsFiles,
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
	// Multi-select state. Keys are `${groupKey}:${relPath}` — the same shape
	// used to identify a card across the grid (top-level, drill, search). The
	// anchor is the last single-clicked or cmd/ctrl-toggled id; shift-click
	// computes a range from anchor to the clicked card within the visible
	// ordered list passed at the call site.
	const [ selectedIds, setSelectedIds ] = useState< Set< string > >(
		() => new Set()
	);
	const [ selectionAnchor, setSelectionAnchor ] = useState< string | null >(
		null
	);
	// Live ref so the drag-start handler can read current selection without
	// re-binding closures on every selection change.
	const selectedIdsRef = useRef< Set< string > >( selectedIds );
	useEffect( () => {
		selectedIdsRef.current = selectedIds;
	}, [ selectedIds ] );
	const clearSelection = (): void => {
		setSelectedIds( ( prev ) => ( prev.size === 0 ? prev : new Set() ) );
		setSelectionAnchor( null );
	};

	// Map of `${groupKey}:${relPath}` → meta for every currently-rendered card.
	// Drag-start uses it to package multi-select payloads. Mutated during
	// render — we reset at the top of each render branch and the JSX builders
	// fill it in as they construct cards. Safe because refs are an escape hatch
	// from React's render flow and we only ever read it from event handlers.
	const dragItemMetaByIdRef = useRef<
		Map<
			string,
			{
				folder: GroupKey;
				relPath: string;
				name: string;
				kind: 'file' | 'dir';
			}
		>
	>( new Map() );
	dragItemMetaByIdRef.current = new Map();
	const buildDragPayload = (
		draggedId: string
	): {
		projectId: string;
		items: Array< {
			folder: GroupKey;
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >;
	} => {
		const sel = selectedIdsRef.current;
		const useMulti = sel.has( draggedId ) && sel.size > 1;
		const ids = useMulti ? Array.from( sel ) : [ draggedId ];
		const items: Array< {
			folder: GroupKey;
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} > = [];
		for ( const id of ids ) {
			const meta = dragItemMetaByIdRef.current.get( id );
			if ( meta ) {
				items.push( meta );
			}
		}
		return { projectId, items };
	};
	const handleCardDragStart = (
		draggedId: string,
		e: React.DragEvent
	): void => {
		const payload = buildDragPayload( draggedId );
		if ( payload.items.length === 0 ) {
			// Nothing to drag — shouldn't happen because the card itself is in
			// the map by the time render finishes, but be defensive.
			e.preventDefault();
			return;
		}
		e.dataTransfer.setData(
			'application/x-studio-write-resources',
			JSON.stringify( payload )
		);
		// Per-group hint MIME so drop targets can filter by source group during
		// dragover (the spec only exposes `dataTransfer.types`, not the data,
		// until drop fires). The source group is the same for every item — a
		// multi-select drag only ever spans a single visible view, which is
		// scoped to a single group.
		const sourceGroup = payload.items[ 0 ].folder;
		e.dataTransfer.setData(
			`application/x-studio-write-resources-${ sourceGroup }`,
			''
		);
		e.dataTransfer.setData(
			'text/plain',
			payload.items.map( ( i ) => i.name ).join( '\n' )
		);
		e.dataTransfer.effectAllowed = 'move';
	};
	const handleFolderInternalDrop = (
		payloadJson: string,
		destFolder: GroupKey,
		destSubPath: string
	): void => {
		if ( ! onMoveResources ) {
			return;
		}
		let parsed: {
			projectId?: string;
			items?: Array< {
				folder?: GroupKey;
				relPath?: string;
				name?: string;
				kind?: 'file' | 'dir';
			} >;
		};
		try {
			parsed = JSON.parse( payloadJson );
		} catch {
			return;
		}
		if (
			parsed.projectId !== projectId ||
			! Array.isArray( parsed.items )
		) {
			return;
		}
		const items: Array< {
			folder: GroupKey;
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} > = [];
		for ( const it of parsed.items ) {
			if (
				it.folder !== destFolder ||
				typeof it.relPath !== 'string' ||
				typeof it.name !== 'string' ||
				( it.kind !== 'file' && it.kind !== 'dir' )
			) {
				// Cross-group drop or malformed item — skip. v1 only supports
				// intra-group moves, and the per-group MIME prevents the drop
				// from being offered, but be defensive.
				continue;
			}
			// Skip the no-op move where the destination dir is the item's own
			// current parent. Computing the parent here keeps the server-side
			// call honest about "actually moved".
			const lastSlash = it.relPath.lastIndexOf( '/' );
			const currentDir =
				lastSlash < 0
					? groupForKey( it.folder ).folder
					: `${ groupForKey( it.folder ).folder }/${ it.relPath.slice(
							0,
							lastSlash
					  ) }`;
			if ( currentDir === destSubPath ) {
				continue;
			}
			// Block dropping a folder into itself or any of its descendants.
			const itemFullPath = `${ groupForKey( it.folder ).folder }/${
				it.relPath
			}`;
			if (
				it.kind === 'dir' &&
				( destSubPath === itemFullPath ||
					destSubPath.startsWith( itemFullPath + '/' ) )
			) {
				continue;
			}
			items.push( {
				folder: it.folder,
				relPath: it.relPath,
				name: it.name,
				kind: it.kind,
			} );
		}
		if ( items.length === 0 ) {
			return;
		}
		onMoveResources( items, destFolder, destSubPath );
		clearSelection();
	};

	// Main process pings us when a background-fetched clipping thumbnail
	// lands on disk. Bump the refresh tick so the list-loading effects pick
	// up the freshly cached file without the user having to navigate away
	// and back.
	useEffect( () => {
		const off = window.api.resources.onThumbReady( ( payload ) => {
			if ( payload.projectId !== projectId ) {
				return;
			}
			setRefreshTick( ( t ) => t + 1 );
		} );
		return () => {
			off();
		};
	}, [ projectId ] );

	// Same idea for the checks folder. The DraftEditorScreen already owns
	// the canonical `checks:watch` subscription (one slot per WebContents),
	// but it isn't always mounted — the resources panel may be on screen
	// without any draft open. Subscribing here too is fine: the watcher
	// maintains one folder subscription per WebContents and the most-
	// recent subscriber wins, so the panel and the editor each take over
	// while they're the active surface.
	useEffect( () => {
		void window.api.checks.watch( projectId );
		const off = window.api.checks.onFolderChanged( ( payload ) => {
			if ( payload.projectId !== projectId ) {
				return;
			}
			setRefreshTick( ( t ) => t + 1 );
		} );
		return () => {
			off();
			void window.api.checks.unwatch();
		};
	}, [ projectId ] );

	useEffect( () => {
		setOpenMenuId( null );
	}, [ projectId ] );

	// Selection is bound to the visible ordered list; switching views (project,
	// drill, search start/stop) makes range anchors and visible ids stale. We
	// depend on `query` rather than the derived `isSearching` because
	// `isSearching` is computed later in the function body and would land in
	// the TDZ on first render.
	useEffect( () => {
		clearSelection();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ projectId, drill, query ] );

	// Esc clears any active selection. Mounted only when there's something to
	// clear so we don't leak listeners.
	useEffect( () => {
		if ( selectedIds.size === 0 ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				clearSelection();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'keydown', onKey );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ selectedIds ] );

	// Returns true when the modifier-click consumed the event (the card's
	// default action — open / preview / edit — should not run). Plain clicks
	// clear the selection as a side effect and return false so the caller's
	// own onClick fires.
	const handleSelectionClick = (
		id: string,
		orderedIds: string[],
		e: React.MouseEvent
	): boolean => {
		if ( e.shiftKey ) {
			e.preventDefault();
			e.stopPropagation();
			const anchor = selectionAnchor;
			if ( ! anchor || ! orderedIds.includes( anchor ) ) {
				setSelectedIds( new Set( [ id ] ) );
				setSelectionAnchor( id );
				return true;
			}
			const a = orderedIds.indexOf( anchor );
			const b = orderedIds.indexOf( id );
			const [ lo, hi ] = a < b ? [ a, b ] : [ b, a ];
			setSelectedIds( new Set( orderedIds.slice( lo, hi + 1 ) ) );
			// Anchor stays put so a follow-up shift-click extends from the same
			// origin — that's what Finder/Explorer do.
			return true;
		}
		if ( e.metaKey || e.ctrlKey ) {
			e.preventDefault();
			e.stopPropagation();
			setSelectedIds( ( prev ) => {
				const next = new Set( prev );
				if ( next.has( id ) ) {
					next.delete( id );
				} else {
					next.add( id );
				}
				return next;
			} );
			setSelectionAnchor( id );
			return true;
		}
		// Plain click: clear and let the default action fire.
		if ( selectedIds.size > 0 ) {
			clearSelection();
		}
		setSelectionAnchor( id );
		return false;
	};

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
	}, [ projectId, drill, isSearching, refreshTick, sourcesRefreshSignal ] );

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
	}, [ projectId, drill, isSearching, refreshTick, sourcesRefreshSignal ] );

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

	const renderSourcesAddMenu = ( opts: {
		testIdPrefix: string;
		subPath: string;
		ariaLabel?: string;
	} ): React.ReactNode => {
		const { testIdPrefix, subPath, ariaLabel = 'Add to sources' } = opts;
		return (
			<Menu.Root>
				<Menu.Trigger
					className="resources-grid-group-add"
					data-testid={ testIdPrefix }
					aria-label={ ariaLabel }
					title={ ariaLabel }
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
							data-testid={ `${ testIdPrefix }-menu` }
						>
							<Menu.Item
								className="menu-item"
								data-testid={ `${ testIdPrefix }-menu-import-url` }
								onClick={ () => {
									onImportUrl?.( subPath );
								} }
								disabled={ ! onImportUrl }
							>
								<span>Import URL</span>
							</Menu.Item>
							<Menu.Item
								className="menu-item"
								data-testid={ `${ testIdPrefix }-menu-import-file` }
								onClick={ () => {
									onImportFile?.( subPath );
								} }
								disabled={ ! onImportFile }
							>
								<span>Import file</span>
							</Menu.Item>
							<Menu.Item
								className="menu-item"
								data-testid={ `${ testIdPrefix }-menu-add-note` }
								onClick={ () => {
									onAddNote?.( subPath );
								} }
								disabled={ ! onAddNote }
							>
								<span>Add note</span>
							</Menu.Item>
							<Menu.Item
								className="menu-item"
								data-testid={ `${ testIdPrefix }-menu-create-folder` }
								onClick={ () => {
									onCreateFolder?.( subPath );
								} }
								disabled={ ! onCreateFolder }
							>
								<span>Create new folder</span>
							</Menu.Item>
						</Menu.Popup>
					</Menu.Positioner>
				</Menu.Portal>
			</Menu.Root>
		);
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

	// Whole-grid OS-file drop zone. Internal drags are intentionally ignored
	// here (moves must target a specific folder card). OS-file imports always
	// land in sources/ — when drilled inside sources/<sub>, into that subpath;
	// otherwise into the sources root.
	const gridDropSubPath: string =
		drill?.groupKey === 'sources' ? drillSubPath( drill ) : 'sources';
	const gridDropProps = onDropOsFiles
		? ( () => {
				const setHover = ( e: React.DragEvent, on: boolean ): void => {
					e.currentTarget.setAttribute(
						'data-drop-active',
						on ? 'true' : 'false'
					);
				};
				const acceptsFiles = (
					types: ReadonlyArray< string >
				): boolean => types.includes( 'Files' );
				return {
					onDragEnter: ( e: React.DragEvent ): void => {
						if ( ! acceptsFiles( e.dataTransfer.types ) ) {
							return;
						}
						e.preventDefault();
						setHover( e, true );
					},
					onDragOver: ( e: React.DragEvent ): void => {
						if ( ! acceptsFiles( e.dataTransfer.types ) ) {
							return;
						}
						e.preventDefault();
						e.dataTransfer.dropEffect = 'copy';
					},
					onDragLeave: ( e: React.DragEvent ): void => {
						const related = e.relatedTarget as Node | null;
						if ( related && e.currentTarget.contains( related ) ) {
							return;
						}
						setHover( e, false );
					},
					onDrop: ( e: React.DragEvent ): void => {
						setHover( e, false );
						if ( ! acceptsFiles( e.dataTransfer.types ) ) {
							return;
						}
						e.preventDefault();
						const files = Array.from( e.dataTransfer.files );
						if ( files.length === 0 ) {
							return;
						}
						onDropOsFiles( files, 'sources', gridDropSubPath );
					},
				};
		  } )()
		: undefined;

	// Clicks on empty grid space (background between cards/sections) clear the
	// multi-select. Card clicks already either consume the event (modifier
	// clicks) or fire their default action without reaching here, so the
	// guard is mostly defensive — only the click that landed on a wrapper
	// element rather than a card should clear.
	const handleBackgroundClick = (
		e: React.MouseEvent< HTMLElement >
	): void => {
		if ( selectedIds.size === 0 ) {
			return;
		}
		const target = e.target as HTMLElement | null;
		if ( ! target ) {
			return;
		}
		// If the click landed on (or inside) a card, breadcrumb link, action
		// menu, or other interactive element, leave selection alone.
		if (
			target.closest(
				'.resources-grid-card, .resources-grid-card-menu, .resources-grid-card-menu-button, .resources-grid-folder-header-link, button, a, input, textarea, [role="menu"]'
			)
		) {
			return;
		}
		clearSelection();
	};

	return (
		// The click handler is a UX enhancement on a container; keyboard
		// users already clear the selection via the global Escape listener.
		// eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
		<div
			className="resources-grid"
			data-testid="resources-grid"
			data-drop-active="false"
			onClick={ handleBackgroundClick }
			{ ...( gridDropProps ?? {} ) }
		>
			<div
				className="resources-grid-drop-overlay"
				data-testid="resources-grid-drop-overlay"
				aria-hidden="true"
			>
				<span>Drop files to import into { gridDropSubPath }</span>
			</div>
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

			{ ! isSearching &&
				drill !== null &&
				( () => {
					const groupSpec = groupForKey( drill.groupKey );
					const isAtGroupRoot = drill.parts.length === 0;
					const currentLabel = isAtGroupRoot
						? groupSpec.label
						: drill.parts[ drill.parts.length - 1 ];
					// Trail = everything before the current segment, rendered
					// as small muted links above the title row. Crumbs that
					// map to a concrete folder in the same group double as
					// drop targets so the user can drag a file back to an
					// ancestor.
					const trail: Array< {
						label: string;
						onClick: () => void;
						testId: string;
						destSubPath?: string;
					} > = [
						{
							label: 'All resources',
							testId: 'resources-breadcrumb-root',
							onClick: () => {
								setDrill( null );
								setQuery( '' );
							},
						},
					];
					if ( ! isAtGroupRoot ) {
						trail.push( {
							label: groupSpec.label,
							testId: `resources-breadcrumb-group-${ drill.groupKey }`,
							destSubPath: groupSpec.folder,
							onClick: () => {
								setDrill( {
									groupKey: drill.groupKey,
									parts: [],
								} );
								setQuery( '' );
							},
						} );
						for ( let i = 0; i < drill.parts.length - 1; i++ ) {
							const idx = i;
							trail.push( {
								label: drill.parts[ idx ],
								testId: `resources-breadcrumb-part-${ idx }`,
								destSubPath: `${
									groupSpec.folder
								}/${ drill.parts
									.slice( 0, idx + 1 )
									.join( '/' ) }`,
								onClick: () => {
									setDrill( {
										groupKey: drill.groupKey,
										parts: drill.parts.slice( 0, idx + 1 ),
									} );
									setQuery( '' );
								},
							} );
						}
					}
					const filteredCount =
						drillState.status === 'loaded'
							? drillState.files.filter( ( f ) =>
									passesShowFilter( f, show )
							  ).length
							: null;
					const currentSubPath = drillSubPath( drill );
					return (
						<header
							className="resources-grid-folder-header"
							data-testid="resources-folder-header"
							data-group-key={ drill.groupKey }
						>
							<nav
								className="resources-grid-folder-header-trail"
								data-testid="resources-breadcrumb"
								aria-label="Resources path"
							>
								{ trail.map( ( crumb, i ) => {
									const crumbDropProps = crumb.destSubPath
										? buildFolderDropProps( {
												destFolder: drill.groupKey,
												onInternalDrop: (
													payloadJson
												) =>
													handleFolderInternalDrop(
														payloadJson,
														drill.groupKey,
														crumb.destSubPath as string
													),
												onFilesDrop: ( droppedFiles ) =>
													onDropOsFiles?.(
														droppedFiles,
														drill.groupKey,
														crumb.destSubPath as string
													),
										  } )
										: undefined;
									return (
										<React.Fragment
											key={ `${ i }-${ crumb.label }` }
										>
											{ i > 0 && (
												<span
													className="resources-grid-folder-header-sep"
													aria-hidden="true"
												>
													/
												</span>
											) }
											<button
												type="button"
												className="resources-grid-folder-header-link"
												data-testid={ crumb.testId }
												data-drop-target="false"
												onClick={ crumb.onClick }
												{ ...( crumbDropProps ?? {} ) }
											>
												{ crumb.label }
											</button>
										</React.Fragment>
									);
								} ) }
							</nav>
							<div className="resources-grid-folder-header-title-row">
								<span
									className="resources-grid-group-badge"
									aria-hidden="true"
								/>
								<h2
									className="resources-grid-folder-header-title"
									aria-current="page"
								>
									{ currentLabel }
								</h2>
								{ filteredCount !== null && (
									<span
										className="resources-grid-group-count"
										data-testid="resources-folder-count"
									>
										{ filteredCount }
									</span>
								) }
								<span className="resources-grid-group-spacer" />
								{ drill.groupKey === 'sources' &&
									renderSourcesAddMenu( {
										testIdPrefix: 'resources-folder-add',
										subPath: currentSubPath,
										ariaLabel: `Add to ${ currentLabel }`,
									} ) }
							</div>
						</header>
					);
				} )() }

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
					selectedIds,
					onSelectionClick: handleSelectionClick,
					onCardDragStart: handleCardDragStart,
					dragItemMetaByIdRef,
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
							data-group-key={ group.key }
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
									<span
										className="resources-grid-group-badge"
										aria-hidden="true"
									/>
									<span className="resources-grid-group-label">
										{ group.label }
									</span>
									{ count !== null && (
										<span className="resources-grid-group-count">
											{ count }
										</span>
									) }
								</button>
								<span className="resources-grid-group-spacer" />
								{ group.key === 'checks' && onNewCheck && (
									<button
										type="button"
										className="resources-grid-group-add"
										data-testid="resources-group-add-checks"
										aria-label="New check"
										title="New check"
										onClick={ onNewCheck }
									>
										<PlusIcon size={ 14 } />
									</button>
								) }
								{ group.key === 'sources' &&
									renderSourcesAddMenu( {
										testIdPrefix:
											'resources-group-add-sources',
										subPath: group.folder,
										ariaLabel: 'Add source',
									} ) }
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
										files.length > 0 &&
										( () => {
											// Bucket folders ahead of leaves
											// so the two never co-occupy a
											// row in the responsive grid.
											const groupFolders = files.filter(
												( f ) => f.isDirectory
											);
											const groupLeaves = files.filter(
												( f ) => ! f.isDirectory
											);
											const groupOrderedIds = [
												...groupFolders,
												...groupLeaves,
											].map(
												( f ) =>
													`${ group.key }:${ f.name }`
											);
											const renderGroupCard = (
												file: DirEntry
											): React.ReactNode => {
												const isFile =
													! file.isDirectory;
												const canPreview =
													isFile &&
													isPreviewable( file.name );
												const isDraftFile =
													group.key === 'drafts' &&
													isFile &&
													isMarkdown( file.name );
												const menuId = `${ group.key }:${ file.name }`;
												const selectionId = `${ group.key }:${ file.name }`;
												dragItemMetaByIdRef.current.set(
													selectionId,
													{
														folder: group.key,
														relPath: file.name,
														name: file.name,
														kind: file.isDirectory
															? 'dir'
															: 'file',
													}
												);
												return (
													<React.Fragment
														key={ file.name }
													>
														{ renderCard( {
															file,
															testIdPrefix: `resources-card-${ group.key }`,
															projectId,
															folder: group.folder,
															relPath: file.name,
															onOpenFolder: () =>
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
															onAddToChat: () =>
																onAddToChat?.(
																	group.key,
																	file.name,
																	file.name,
																	! isFile
																),
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
															selected:
																selectedIds.has(
																	selectionId
																),
															onSelectionClick: (
																e
															) =>
																handleSelectionClick(
																	selectionId,
																	groupOrderedIds,
																	e
																),
															onCardDragStart: (
																e
															) =>
																handleCardDragStart(
																	selectionId,
																	e
																),
															folderDropTarget:
																file.isDirectory
																	? {
																			destFolder:
																				group.key,
																			onInternalDrop:
																				(
																					payloadJson
																				) =>
																					handleFolderInternalDrop(
																						payloadJson,
																						group.key,
																						`${ group.folder }/${ file.name }`
																					),
																			onFilesDrop:
																				(
																					droppedFiles
																				) =>
																					onDropOsFiles?.(
																						droppedFiles,
																						group.key,
																						`${ group.folder }/${ file.name }`
																					),
																	  }
																	: undefined,
														} ) }
													</React.Fragment>
												);
											};
											return (
												<BucketedGrid
													folders={ groupFolders }
													leaves={ groupLeaves }
													renderItem={
														renderGroupCard
													}
												/>
											);
										} )() }
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
							// Bucket folders ahead of leaves so the two never
							// co-occupy a row. Without this split a tall
							// folder card next to short text cards leaves a
							// large dead-space gap on the right of the row.
							const drillFolders = drillFiles.filter(
								( f ) => f.isDirectory
							);
							const drillLeaves = drillFiles.filter(
								( f ) => ! f.isDirectory
							);
							const drillOrderedIds = [
								...drillFolders,
								...drillLeaves,
							].map(
								( f ) =>
									`${ drill.groupKey }:${ [
										...drill.parts,
										f.name,
									].join( '/' ) }`
							);
							const renderDrillCard = (
								file: DirEntry
							): React.ReactNode => {
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
								const selectionId = `${ drill.groupKey }:${ relPath }`;
								dragItemMetaByIdRef.current.set( selectionId, {
									folder: drill.groupKey,
									relPath,
									name: file.name,
									kind: file.isDirectory ? 'dir' : 'file',
								} );
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
													groupKey: drill.groupKey,
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
											onAddToChat: () =>
												onAddToChat?.(
													drill.groupKey,
													relPath,
													file.name,
													! isFile
												),
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
											selected:
												selectedIds.has( selectionId ),
											onSelectionClick: ( e ) =>
												handleSelectionClick(
													selectionId,
													drillOrderedIds,
													e
												),
											onCardDragStart: ( e ) =>
												handleCardDragStart(
													selectionId,
													e
												),
											folderDropTarget: file.isDirectory
												? {
														destFolder:
															drill.groupKey,
														onInternalDrop: (
															payloadJson
														) =>
															handleFolderInternalDrop(
																payloadJson,
																drill.groupKey,
																`${
																	groupForKey(
																		drill.groupKey
																	).folder
																}/${ relPath }`
															),
														onFilesDrop: (
															files
														) =>
															onDropOsFiles?.(
																files,
																drill.groupKey,
																`${
																	groupForKey(
																		drill.groupKey
																	).folder
																}/${ relPath }`
															),
												  }
												: undefined,
										} ) }
									</React.Fragment>
								);
							};
							return (
								<BucketedGrid
									folders={ drillFolders }
									leaves={ drillLeaves }
									renderItem={ renderDrillCard }
								/>
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
	selectedIds,
	onSelectionClick,
	onCardDragStart,
	dragItemMetaByIdRef,
}: {
	searchState: SearchState;
	projectId: string;
	show: ResourcesShowFilter;
	onOpenHit: ( hit: SearchHit ) => void;
	onPreviewFile?: ( folder: GroupKey, relPath: string, name: string ) => void;
	onAddToChat?: (
		folder: GroupKey,
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
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
	selectedIds: Set< string >;
	onSelectionClick: (
		id: string,
		orderedIds: string[],
		e: React.MouseEvent
	) => boolean;
	onCardDragStart: ( id: string, e: React.DragEvent ) => void;
	dragItemMetaByIdRef: React.MutableRefObject<
		Map<
			string,
			{
				folder: GroupKey;
				relPath: string;
				name: string;
				kind: 'file' | 'dir';
			}
		>
	>;
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
						data-group-key={ group.key }
					>
						<header className="resources-grid-group-header">
							<span
								className="resources-grid-group-badge"
								aria-hidden="true"
							/>
							<span className="resources-grid-group-label">
								{ group.label }
							</span>
							<span className="resources-grid-group-count">
								{ hits.length }
							</span>
						</header>
						<div className="resources-grid-cards">
							{ ( () => {
								const hitOrderedIds = hits.map(
									( h ) => `${ group.key }:${ h.relPath }`
								);
								return hits.map( ( hit ) => {
									const isFile = ! hit.isDirectory;
									const canPreview =
										isFile && isPreviewable( hit.name );
									const isDraftFile =
										group.key === 'drafts' &&
										isFile &&
										isMarkdown( hit.name );
									const menuId = `search:${ group.key }:${ hit.relPath }`;
									const selectionId = `${ group.key }:${ hit.relPath }`;
									dragItemMetaByIdRef.current.set(
										selectionId,
										{
											folder: group.key,
											relPath: hit.relPath,
											name: hit.name,
											kind: hit.isDirectory
												? 'dir'
												: 'file',
										}
									);
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
												onAddToChat: () =>
													onAddToChat?.(
														group.key,
														hit.relPath,
														hit.name,
														! isFile
													),
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
												selected:
													selectedIds.has(
														selectionId
													),
												onSelectionClick: ( e ) =>
													onSelectionClick(
														selectionId,
														hitOrderedIds,
														e
													),
												onCardDragStart: ( e ) =>
													onCardDragStart(
														selectionId,
														e
													),
											} ) }
										</React.Fragment>
									);
								} );
							} )() }
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

// Two-bucket grid that detects the responsive column count at runtime and
// promotes the first N leaves into the same row as a stranded final folder,
// then renders the rest of the leaves in a second grid below.
//
// This eliminates the "Clippings alone on its row with empty columns to the
// right" issue without losing the section-break feel between folders and
// leaves: the only row that mixes the two is the last folder row, which
// otherwise would have wasted those empty cells anyway.
//
// First render uses the `defaultCols` hint to avoid an empty/wrong-split
// flash. The ResizeObserver corrects the count when the actual grid lays
// out, which is what the user sees as the "settled" state.
function BucketedGrid< T >( {
	folders,
	leaves,
	renderItem,
	defaultCols = 4,
}: {
	folders: T[];
	leaves: T[];
	renderItem: ( item: T ) => React.ReactNode;
	defaultCols?: number;
} ): React.ReactElement {
	const ref = useRef< HTMLDivElement | null >( null );
	const [ cols, setCols ] = useState( defaultCols );
	useEffect( () => {
		const el = ref.current;
		if ( ! el ) {
			return;
		}
		const update = (): void => {
			const cs = getComputedStyle( el );
			const tracks = cs.gridTemplateColumns
				.split( ' ' )
				.filter( ( t ) => t.length > 0 );
			if ( tracks.length > 0 ) {
				setCols( tracks.length );
			}
		};
		update();
		const obs = new ResizeObserver( update );
		obs.observe( el );
		return () => obs.disconnect();
	}, [] );
	const stragglerCount =
		cols > 0 && folders.length > 0 && folders.length % cols !== 0
			? cols - ( folders.length % cols )
			: 0;
	const stragglers = leaves.slice( 0, stragglerCount );
	const remaining = leaves.slice( stragglerCount );
	return (
		<>
			{ ( folders.length > 0 || stragglers.length > 0 ) && (
				<div ref={ ref } className="resources-grid-cards">
					{ folders.map( renderItem ) }
					{ stragglers.map( renderItem ) }
				</div>
			) }
			{ remaining.length > 0 && (
				<div className="resources-grid-cards">
					{ remaining.map( renderItem ) }
				</div>
			) }
		</>
	);
}

function renderFolderThumbStack( {
	projectId,
	thumbPaths,
	entryCount,
}: {
	projectId: string;
	thumbPaths: string[] | undefined;
	entryCount?: number | undefined;
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
			{ renderFolderStackCount( entryCount ) }
		</span>
	);
}

// Text-stack visual for markdown-only folders: render the folder's most
// recent children's title + excerpt onto three layered paper tiles.
// At the fan rotation only the topmost tile's text is fully visible; the
// back tiles' text peeks out as a depth indicator. Sizes are intentionally
// small (the tile is ~110 px tall) but kept legible — 10 px title /
// 8 px excerpt — so each folder reads as "Logs (with daily log entries)"
// rather than "an undifferentiated stack of pages".
function renderFolderTextStack( {
	tiles,
	entryCount,
}: {
	tiles: { title: string; excerpt?: string }[] | undefined;
	entryCount?: number | undefined;
} ): React.ReactNode {
	if ( ! tiles || tiles.length === 0 ) {
		return null;
	}
	// Backend hands these back newest-first; topmost tile is the last DOM
	// child (highest z-index), so reverse before rendering.
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
			{ renderFolderStackCount( entryCount ) }
		</span>
	);
}

// Fallback for folders that have no markdown children to summarize (truly
// empty folders). Same fan geometry, no content.
function renderFolderAbstractStack( {
	entryCount,
}: {
	entryCount?: number | undefined;
} ): React.ReactNode {
	return (
		<span
			className="resources-grid-card-folder-stack"
			data-tile-count="3"
			data-variant="abstract"
			aria-hidden="true"
		>
			<span className="resources-grid-card-folder-stack-tile resources-grid-card-folder-stack-tile-abstract" />
			<span className="resources-grid-card-folder-stack-tile resources-grid-card-folder-stack-tile-abstract" />
			<span className="resources-grid-card-folder-stack-tile resources-grid-card-folder-stack-tile-abstract" />
			{ renderFolderStackCount( entryCount ) }
		</span>
	);
}

function renderFolderStackCount( count: number | undefined ): React.ReactNode {
	if ( count === undefined || count <= 0 ) {
		return null;
	}
	return (
		<span className="resources-grid-card-folder-stack-count">
			{ count }
		</span>
	);
}

function renderCardThumbSlot( {
	file,
	projectId,
	folder,
	relPath,
}: {
	file: DirEntry;
	projectId: string;
	folder: string;
	relPath: string;
} ): React.ReactNode {
	if ( file.isDirectory ) {
		if ( file.childThumbPaths && file.childThumbPaths.length > 0 ) {
			return renderFolderThumbStack( {
				projectId,
				thumbPaths: file.childThumbPaths,
				entryCount: file.entryCount,
			} );
		}
		if ( file.childTextTiles && file.childTextTiles.length > 0 ) {
			return renderFolderTextStack( {
				tiles: file.childTextTiles,
				entryCount: file.entryCount,
			} );
		}
		return renderFolderAbstractStack( {
			entryCount: file.entryCount,
		} );
	}
	if ( isImage( file.name ) ) {
		return renderImageThumbnail( {
			projectId,
			folder,
			relPath,
			name: file.name,
		} );
	}
	if ( isPdf( file.name ) ) {
		return renderPdfThumbnail( {
			projectId,
			folder,
			relPath,
			name: file.name,
			mtime: file.mtime,
			thumbPath: file.thumbPath,
		} );
	}
	if ( isVideo( file.name ) ) {
		return renderVideoThumbnail( {
			projectId,
			folder,
			relPath,
			name: file.name,
			mtime: file.mtime,
			thumbPath: file.thumbPath,
		} );
	}
	// Markdown clipping with a cached og:image / YouTube thumbnail. Wraps
	// the regular thumb img in a frame so we can overlay a play-triangle
	// for video kinds and a host pill in the corner.
	if ( file.thumbPath && file.clippingKind ) {
		return (
			<span
				className="resources-grid-card-clip-thumb"
				data-kind={ file.clippingKind }
				aria-hidden="true"
			>
				<img
					className="resources-grid-card-thumb"
					src={ `studio-asset://${ projectId }/${ file.thumbPath }` }
					alt=""
					loading="lazy"
				/>
				{ file.clippingKind === 'youtube' && (
					<span className="resources-grid-card-clip-play" />
				) }
				{ file.clippingHost && (
					<span className="resources-grid-card-clip-host">
						{ file.clippingHost }
					</span>
				) }
			</span>
		);
	}
	// Markdown leaves with no usable image fall through to the card body
	// renderer, which paints the title + excerpt + meta as a real note card
	// (no fake-paper rectangle). Returning null here is what lets the card
	// shrink to its natural content height.
	return null;
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
	selected,
	onSelectionClick,
	onCardDragStart,
	folderDropTarget,
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
	selected?: boolean;
	onSelectionClick?: ( e: React.MouseEvent ) => boolean;
	onCardDragStart?: ( e: React.DragEvent ) => void;
	folderDropTarget?: {
		destFolder: GroupKey;
		onInternalDrop: ( payloadJson: string ) => void;
		onFilesDrop: ( files: File[] ) => void;
	};
} ): React.ReactElement {
	const testId = `${ testIdPrefix }-${ file.name }`;
	const isDir = file.isDirectory;
	const dateMtime = isDir ? file.latestChildMtime : file.mtime;
	const date = dateMtime !== undefined ? relativeDate( dateMtime ) : null;
	const kind = isDir
		? folderKindLabel( file.entryCount )
		: fileKindLabel( file.name );
	const thumb = renderCardThumbSlot( {
		file,
		projectId,
		folder,
		relPath,
	} );
	// Markdown is the implicit default file kind in this app; surfacing a
	// `.MD` chip on every text note adds noise. The chip is reserved for
	// non-text kinds (PDF, image, video, folder) where it actually carries
	// information.
	const showChip = isDir || ( ! isDir && ! isMarkdown( file.name ) );
	// Dates older than 30 days stop being useful on a card preview — drop
	// them so the meta row collapses to just the chip (or nothing).
	const showDate = date !== null && isRecent( dateMtime );
	const excerpt = file.excerpt?.trim() ?? '';
	// In-card excerpt: render below the title as readable body text when
	// there's no thumbnail rectangle (markdown leaf without an og:image).
	// This replaces the old fake-paper preview tile so cards become real
	// note cards instead of 16:10 rectangles full of illegible 8px text.
	const showExcerpt = ! isDir && ! thumb && excerpt.length > 0;
	const displayName = file.title ?? file.name;
	const isPlaceholderName = isUntitled( displayName );
	const body = (
		<>
			{ thumb }
			<span className="resources-grid-card-head">
				<span
					className="resources-grid-card-name"
					data-placeholder={ isPlaceholderName ? 'true' : undefined }
				>
					{ displayName }
				</span>
			</span>
			{ showExcerpt && (
				<span className="resources-grid-card-body">{ excerpt }</span>
			) }
			{ ( showChip || showDate || ( ! thumb && file.clippingHost ) ) && (
				<span className="resources-grid-card-meta">
					{ showChip && (
						<span className="resources-grid-card-chip">
							{ kind }
						</span>
					) }
					{ ! thumb && file.clippingHost && (
						<span className="resources-grid-card-host-pill">
							{ file.clippingHost }
						</span>
					) }
					{ showDate && (
						<span className="resources-grid-card-date">
							{ date }
						</span>
					) }
				</span>
			) }
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
			onAddToChat,
			addToChatDisabled,
			onDelete,
			body,
			selected,
			onSelectionClick,
			onCardDragStart,
			dropTarget: folderDropTarget,
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
			selected,
			onSelectionClick,
			onCardDragStart,
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
			selected,
			onSelectionClick,
			onCardDragStart,
		} );
	}
	return (
		<button
			type="button"
			className="resources-grid-card"
			data-kind="file"
			data-previewable="false"
			data-testid={ testId }
			data-selected={ selected ? 'true' : 'false' }
			draggable={ onCardDragStart ? true : undefined }
			onDragStart={ onCardDragStart }
			onClick={ ( e ) => onSelectionClick?.( e ) }
			title="Preview unavailable for this file type"
		>
			{ body }
		</button>
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
	selected,
	onSelectionClick,
	onCardDragStart,
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
	selected?: boolean;
	onSelectionClick?: ( e: React.MouseEvent ) => boolean;
	onCardDragStart?: ( e: React.DragEvent ) => void;
} ): React.ReactElement {
	const defaultAction = onEditDraft ?? onPreviewFile;
	const handleClick = ( e: React.MouseEvent ): void => {
		if ( onSelectionClick && onSelectionClick( e ) ) {
			return;
		}
		defaultAction();
	};
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
				data-selected={ selected ? 'true' : 'false' }
				draggable={ onCardDragStart ? true : undefined }
				onDragStart={ onCardDragStart }
				onClick={ handleClick }
				title={ onEditDraft ? `Edit ${ title }` : `Preview ${ title }` }
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

// Builds drag-over / drop event handlers for a folder card. The handlers
// imperatively toggle data-drop-target via setAttribute (no React state
// per card — we'd otherwise need a wrapper component per row). dragleave
// uses a relatedTarget containment check rather than a counter so child
// transitions don't flicker the hover state.
function buildFolderDropProps( {
	destFolder,
	onInternalDrop,
	onFilesDrop,
}: {
	destFolder: GroupKey;
	onInternalDrop: ( payloadJson: string ) => void;
	onFilesDrop: ( files: File[] ) => void;
} ): {
	onDragEnter: ( e: React.DragEvent ) => void;
	onDragOver: ( e: React.DragEvent ) => void;
	onDragLeave: ( e: React.DragEvent ) => void;
	onDrop: ( e: React.DragEvent ) => void;
} {
	const internalMime = `application/x-studio-write-resources-${ destFolder }`;
	const accepts = (
		types: ReadonlyArray< string >
	): 'internal' | 'files' | null => {
		if ( types.includes( internalMime ) ) {
			return 'internal';
		}
		if ( types.includes( 'Files' ) ) {
			return 'files';
		}
		return null;
	};
	const setHover = ( e: React.DragEvent, on: boolean ): void => {
		e.currentTarget.setAttribute(
			'data-drop-target',
			on ? 'true' : 'false'
		);
	};
	return {
		onDragEnter: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			setHover( e, true );
		},
		onDragOver: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			e.dataTransfer.dropEffect = kind === 'files' ? 'copy' : 'move';
		},
		onDragLeave: ( e ) => {
			const related = e.relatedTarget as Node | null;
			if ( related && e.currentTarget.contains( related ) ) {
				return;
			}
			setHover( e, false );
		},
		onDrop: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			setHover( e, false );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			if ( kind === 'internal' ) {
				const payload = e.dataTransfer.getData(
					'application/x-studio-write-resources'
				);
				if ( payload ) {
					onInternalDrop( payload );
				}
				return;
			}
			const files = Array.from( e.dataTransfer.files );
			if ( files.length > 0 ) {
				onFilesDrop( files );
			}
		},
	};
}

function renderFolderCard( {
	testId,
	title,
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	onOpenFolder,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onDelete,
	body,
	selected,
	onSelectionClick,
	onCardDragStart,
	dropTarget,
}: {
	testId: string;
	title: string;
	menuId: string | null;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	onOpenFolder: () => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	addToChatDisabled?: boolean;
	onDelete?: () => void;
	body: React.ReactNode;
	selected?: boolean;
	onSelectionClick?: ( e: React.MouseEvent ) => boolean;
	onCardDragStart?: ( e: React.DragEvent ) => void;
	dropTarget?: {
		destFolder: GroupKey;
		onInternalDrop: ( payloadJson: string ) => void;
		onFilesDrop: ( files: File[] ) => void;
	};
} ): React.ReactElement {
	const handleClick = ( e: React.MouseEvent ): void => {
		if ( onSelectionClick && onSelectionClick( e ) ) {
			return;
		}
		onOpenFolder();
	};
	const folderDropProps = dropTarget
		? buildFolderDropProps( dropTarget )
		: undefined;
	const folderButton = (
		<button
			type="button"
			className="resources-grid-card"
			data-kind="dir"
			data-testid={ testId }
			data-selected={ selected ? 'true' : 'false' }
			data-drop-target="false"
			draggable={ onCardDragStart ? true : undefined }
			onDragStart={ onCardDragStart }
			onClick={ handleClick }
			title={ `Open ${ title }` }
			{ ...( folderDropProps ?? {} ) }
		>
			{ body }
		</button>
	);
	const hasAnyAction = !! onAddToChat || !! onOpenNewChat || !! onDelete;
	if ( ! hasAnyAction || menuId === null ) {
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
				onAddToChat={ onAddToChat }
				onOpenNewChat={ onOpenNewChat }
				addToChatDisabled={ addToChatDisabled }
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
	selected,
	onSelectionClick,
	onCardDragStart,
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
	selected?: boolean;
	onSelectionClick?: ( e: React.MouseEvent ) => boolean;
	onCardDragStart?: ( e: React.DragEvent ) => void;
} ): React.ReactElement {
	// Non-previewable file cards aren't interactive on plain click, so the
	// selection wiring fires on mousedown (kept in sync with the click event
	// shape so modifier behavior matches the rest of the grid).
	const handleClick = ( e: React.MouseEvent ): void => {
		if ( onSelectionClick ) {
			onSelectionClick( e );
		}
	};
	return (
		<div
			className="resources-grid-card-cell"
			data-testid={ `${ testId }-cell` }
		>
			<button
				type="button"
				className="resources-grid-card"
				data-kind="file"
				data-previewable="false"
				data-testid={ testId }
				data-selected={ selected ? 'true' : 'false' }
				draggable={ onCardDragStart ? true : undefined }
				onDragStart={ onCardDragStart }
				onClick={ handleClick }
				title="Preview unavailable for this file type"
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
	selected,
	onSelectionClick,
	onCardDragStart,
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
	selected?: boolean;
	onSelectionClick?: ( e: React.MouseEvent ) => boolean;
	onCardDragStart?: ( e: React.DragEvent ) => void;
} ): React.ReactElement {
	const testId = `resources-search-card-${ groupKey }-${ hit.relPath }`;
	const isDir = hit.isDirectory;
	const date =
		! isDir && hit.mtime !== undefined ? relativeDate( hit.mtime ) : null;
	const kind = isDir ? 'Folder' : fileKindLabel( hit.name );
	const hitFile: DirEntry = {
		name: hit.name,
		isDirectory: hit.isDirectory,
		mtime: hit.mtime,
		excerpt: hit.excerpt,
		thumbPath: hit.thumbPath,
	};
	const thumb = renderCardThumbSlot( {
		file: hitFile,
		projectId,
		folder: groupForKey( groupKey ).folder,
		relPath: hit.relPath,
	} );
	const showChip = isDir || ! isMarkdown( hit.name );
	const showDate = date !== null && isRecent( hit.mtime );
	const hitExcerpt = hit.excerpt?.trim() ?? '';
	const showExcerpt = ! isDir && ! thumb && hitExcerpt.length > 0;
	const isPlaceholderName = isUntitled( hit.name );
	const body = (
		<>
			{ thumb }
			<span className="resources-grid-card-head">
				<span
					className="resources-grid-card-name"
					data-placeholder={ isPlaceholderName ? 'true' : undefined }
				>
					{ hit.name }
				</span>
			</span>
			{ showExcerpt && (
				<span className="resources-grid-card-body">{ hitExcerpt }</span>
			) }
			{ ( showChip || showDate ) && (
				<span className="resources-grid-card-meta">
					{ showChip && (
						<span className="resources-grid-card-chip">
							{ kind }
						</span>
					) }
					{ showDate && (
						<span className="resources-grid-card-date">
							{ date }
						</span>
					) }
				</span>
			) }
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
			onAddToChat,
			addToChatDisabled,
			onDelete,
			body,
			selected,
			onSelectionClick,
			onCardDragStart,
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
			selected,
			onSelectionClick,
			onCardDragStart,
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
			selected,
			onSelectionClick,
			onCardDragStart,
		} );
	}
	return (
		<button
			type="button"
			className="resources-grid-card"
			data-kind="file"
			data-previewable="false"
			data-testid={ testId }
			data-selected={ selected ? 'true' : 'false' }
			draggable={ onCardDragStart ? true : undefined }
			onDragStart={ onCardDragStart }
			onClick={ ( e ) => onSelectionClick?.( e ) }
			title="Preview unavailable for this file type"
		>
			{ body }
		</button>
	);
}
