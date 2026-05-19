import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentLess,
	insertTab,
	redoDepth,
	undoDepth,
} from '@codemirror/commands';
import {
	markdown,
	markdownKeymap,
	markdownLanguage,
} from '@codemirror/lang-markdown';
import {
	bracketMatching,
	defaultHighlightStyle,
	indentUnit,
	syntaxHighlighting,
} from '@codemirror/language';
import { gotoLine, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
	drawSelection,
	dropCursor,
	EditorView,
	keymap,
} from '@codemirror/view';

import { DeleteResourceDialog } from '../components/DeleteResourceDialog';
import { DraftEditorActionMenu } from '../components/DraftEditorActionMenu';
import { RenameDraftDialog } from '../components/RenameDraftDialog';
import { AiMenu, type AiMenuPosition } from '../editor/AiMenu';
import {
	migrateMemo,
	readMemo,
	writeMemo,
} from '../editor/draft-cursor-memory';
import { slugifyTitle } from '../../main/channels/utils/slugify';
import { emptyLinePlaceholder } from '../editor/empty-line-placeholder';
import { FormattingToolbar } from '../editor/FormattingToolbar';
import { SelectionMenu } from '../editor/SelectionMenu';
import {
	SlashMenu,
	type SlashAction,
	type SlashMenuPosition,
} from '../editor/SlashMenu';
import {
	DraftSidebar,
	isDraftSidebarTabEnabled,
	type AddedSelection,
} from '../components/DraftSidebar';
import { InlineFileEditor } from '../components/InlineFileEditor';
import { type ChatMessage } from '../components/ChatTranscript';
import { type PermissionRequest } from '../components/PermissionPrompt';
import type {
	ChatMeta,
	DraftAttachment,
	DraftCheckIssue,
	DraftCheckMeta,
	DraftSidebarTab,
	MessageSelection,
	OpenResource,
} from '../../types';
import {
	markdownImageWidget,
	projectIdFacet,
} from '../editor/markdown-image-widget';
import {
	escapeLeftToTitle,
	escapeUpToTitle,
	markdownBlockBindings,
	markdownFormattingBindings,
	markdownTabBindings,
	pasteUrlAsLink,
	smartSelectionWrap,
} from '../editor/markdown-keymap';
import { CheckIssuePopover } from '../components/CheckIssuePopover';
import { computeAnchorPosition } from '../editor/coords';
import {
	applyAnnotation,
	checkIssuesField,
	clearIssuesEffect,
	isApplyTransaction,
	planBulkApply,
	setActiveIssueEffect,
	setIssuesEffect,
	shiftIssuesAfterApply,
} from '../editor/draft-check-decorations';
import { markdownLinkClick } from '../editor/markdown-link-click';
import { markdownLiveDecorations } from '../editor/markdown-live-decorations';
import {
	extractHeadings,
	headingsEqual,
	type Heading,
} from '../editor/markdown-outline';
import { markdownTaskWidget } from '../editor/markdown-task-widget';
import {
	countChars,
	countWords,
	useSelectionMenu,
} from '../editor/useSelectionMenu';
import { useAutoSave } from '../hooks/useAutoSave';
import { htmlToMarkdown } from '../lib/htmlToMarkdown';
import { relativeDate } from '../lib/relativeDate';

const FOLDER_LABEL: Record< string, string > = {
	sources: 'Source',
	drafts: 'Draft',
	done: 'Done',
	checks: 'Check',
};

// Reading time uses 200 wpm — the conventional prose estimate.
const READING_WPM = 200;

function readingMinutes( words: number ): number {
	return Math.max( 1, Math.round( words / READING_WPM ) );
}

type Props = {
	projectId: string;
	relPath: string;
	title: string;
	folder?: 'sources' | 'drafts' | 'done' | 'checks';
	// Resource the chat composer auto-attaches on send. Threaded down to
	// DraftSidebar → DraftChatPanel; while the editor is mounted this is
	// always the draft being edited (matches `relPath`/`folder` above).
	openResource: OpenResource | null;
	onBack: () => void;
	onRelPathChanged: ( newRelPath: string ) => void;
	onPublishedAndMoved?: ( newRelPath: string ) => void;

	// Chat surface — owned by App so the project view and the draft sidebar
	// share the same active chat, message log, and pending permission queue.
	chats: ChatMeta[];
	activeChatId: string | null;
	messages: ChatMessage[];
	busy: boolean;
	permissions: PermissionRequest[];
	onSelectChat: ( chatId: string ) => void;
	onNewChat: () => void;
	onDeleteChat: ( chatId: string ) => void;
	pendingAttachments: DraftAttachment[];
	pendingSelections: AddedSelection[];
	onAddSelection: ( selection: MessageSelection ) => void;
	onClearPendingSelections: () => void;
	onRemovePendingAttachment: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onSend: (
		prompt: string,
		opts: {
			userMessageText?: string;
			selections?: MessageSelection[];
			attachments?: DraftAttachment[];
		}
	) => void;
	onCancelChat: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
	onAttachResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	) => void;
	onDropOsFilesToChat?: ( files: File[] ) => void;
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
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

type Snapshot = { title: string; body: string };

const snapshotEq = ( a: Snapshot, b: Snapshot ): boolean =>
	a.title === b.title && a.body === b.body;

export function DraftEditorScreen( {
	projectId,
	relPath,
	title,
	folder = 'drafts',
	openResource,
	onBack,
	onRelPathChanged,
	onPublishedAndMoved,
	chats,
	activeChatId,
	messages,
	busy,
	permissions,
	onSelectChat,
	onNewChat,
	onDeleteChat,
	pendingAttachments,
	pendingSelections,
	onAddSelection,
	onClearPendingSelections,
	onRemovePendingAttachment,
	onSend,
	onCancelChat,
	onPermissionDecision,
	onAttachResources,
	onDropOsFilesToChat,
	onPreviewAttachment,
	onAddToChat,
	onOpenNewChat,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< State >( { status: 'loading' } );
	// Bumped when the watcher reports an external on-disk change. Threaded
	// into the load-effect deps so the same load → remount path runs without
	// duplicating the load logic.
	const [ reloadCounter, setReloadCounter ] = useState< number >( 0 );
	const [ titleInput, setTitleInput ] = useState< string >( title );
	const [ body, setBody ] = useState< string >( '' );
	const [ historyState, setHistoryState ] = useState< {
		canUndo: boolean;
		canRedo: boolean;
	} >( { canUndo: false, canRedo: false } );
	const [ aiMenu, setAiMenu ] = useState< {
		open: boolean;
		position: AiMenuPosition | null;
	} >( { open: false, position: null } );
	const [ slashMenu, setSlashMenu ] = useState< {
		open: boolean;
		position: SlashMenuPosition | null;
	} >( { open: false, position: null } );
	// Captures the doc position where the menu was triggered. The user may
	// click around (file picker, etc.) before an action runs, so we anchor
	// the insertion to the trigger line rather than the live cursor.
	const slashTriggerLineRef = useRef< { from: number; to: number } | null >(
		null
	);
	const [ pendingDeletion, setPendingDeletion ] = useState< {
		name: string;
	} | null >( null );
	const [ deleting, setDeleting ] = useState< boolean >( false );
	const [ renameDialog, setRenameDialog ] = useState< {
		open: boolean;
		busy: boolean;
		error: 'invalid-name' | 'collision' | 'io-error' | null;
	} >( { open: false, busy: false, error: null } );
	// Tracks the slug we last attempted to auto-rename to, so a stuck blur →
	// blur loop on the title doesn't keep firing the same IPC. Reset whenever
	// the slug actually changes.
	const lastAutoRenameSlugRef = useRef< string | null >( null );
	// Selections live in App.tsx keyed by chat, so the chip survives the
	// back-to-project trip and the same staged context shows up wherever the
	// chat is open.
	// Frontmatter (other keys) and mtime ride along — both get refreshed
	// on each successful save so subsequent writes don't trigger a stale
	// mtime conflict guard.
	const frontmatterRef = useRef< Record< string, unknown > >( {} );
	const mtimeRef = useRef< number | null >( null );
	const [ displayMtime, setDisplayMtime ] = useState< number | null >( null );
	const hostRef = useRef< HTMLDivElement | null >( null );
	const viewRef = useRef< EditorView | null >( null );
	const titleInputRef = useRef< HTMLInputElement | null >( null );
	// The scroll container wraps the title + the editor host so they
	// scroll together. Replaces the old setup where CM6 owned the scroll
	// and the title sat above as a sibling that never moved.
	const scrollRef = useRef< HTMLDivElement | null >( null );
	// Mirror of viewRef in state so the formatting toolbar (a child) can
	// rerender once the editor is mounted. Refs aren't reactive — the
	// parent doesn't re-render when viewRef.current changes — so the
	// toolbar would otherwise stay frozen at view={null}.
	const [ editorView, setEditorView ] = useState< EditorView | null >( null );
	// The header (back button + formatting toolbar + word count) renders
	// into the window titlebar slot owned by App.tsx. Resolve the slot via
	// a layout effect so the portal mounts in the same paint as the screen
	// — avoids a one-frame flash where the titlebar is empty.
	const [ titlebarSlot, setTitlebarSlot ] = useState< HTMLElement | null >(
		null
	);
	useLayoutEffect( () => {
		setTitlebarSlot(
			document.getElementById( 'draft-editor-titlebar-slot' )
		);
	}, [] );

	// Sidebar state hydrates from window-level ui-prefs. Default to open
	// before hydration so the layout doesn't pop in the moment prefs land.
	// Persistence happens in the setter callbacks below — never via a deps
	// effect that would race the initial hydrate.
	const [ sidebarOpen, setSidebarOpen ] = useState< boolean >( true );
	const [ sidebarTab, setSidebarTab ] = useState< DraftSidebarTab >( 'chat' );
	const docKind: 'draft' | 'done' =
		folder === 'done' || folder === 'checks' ? 'done' : 'draft';

	useEffect( () => {
		if ( ! isDraftSidebarTabEnabled( sidebarTab, docKind ) ) {
			setSidebarTab( 'chat' );
		}
	}, [ docKind, sidebarTab ] );
	// Outline data flows from the editor's lezer tree on every doc change;
	// `cursorLine` follows the selection so the panel can mark the heading
	// containing the cursor as active.
	const [ headings, setHeadings ] = useState< Heading[] >( [] );
	const [ cursorLine, setCursorLine ] = useState< number >( 1 );

	// Checks tab state. Issues are stamped at run time with `checkRelPath`
	// (stable identity) and `checkTitle` (display label captured then), so
	// downstream rendering doesn't have to cross-reference `checksMeta` to
	// label a group.
	const [ checksMeta, setChecksMeta ] = useState< DraftCheckMeta[] >( [] );
	const [ checkIssues, setCheckIssues ] = useState< DraftCheckIssue[] >( [] );
	const [ activeIssueId, setActiveIssueId ] = useState< string | null >(
		null
	);
	const [ checksRunning, setChecksRunning ] = useState< boolean >( false );
	const [ checksErrorByCheck, setChecksErrorByCheck ] = useState<
		Record< string, string >
	>( {} );
	const [ editingCheckRelPath, setEditingCheckRelPath ] = useState<
		string | null
	>( null );
	const [ issuePopover, setIssuePopover ] = useState< {
		issueId: string;
		position: { top: number; left: number };
	} | null >( null );
	// Mirror of issues into a ref so the once-mounted CM mousedown handler
	// can resolve issue id → metadata + range without re-binding on every
	// state change.
	const checkIssuesRef = useRef< DraftCheckIssue[] >( [] );
	useEffect( () => {
		checkIssuesRef.current = checkIssues;
	}, [ checkIssues ] );

	// Load + folder-watch the project's checks/. Each event coalesces into
	// one re-list (the watcher itself emits opaque "something changed"
	// pings; the panel pulls fresh metadata). Drop stale responses if the
	// active project shifts under us.
	useEffect( () => {
		let cancelled = false;
		const reload = async (): Promise< void > => {
			const list = await window.api.checks.list( projectId );
			if ( cancelled ) {
				return;
			}
			setChecksMeta( list );
		};
		void reload();
		void window.api.checks.watch( projectId );
		const off = window.api.checks.onFolderChanged( ( event ) => {
			if ( event.projectId !== projectId ) {
				return;
			}
			void reload();
		} );
		return () => {
			cancelled = true;
			off();
			void window.api.checks.unwatch();
		};
	}, [ projectId ] );

	// Mousedown handlers in the CM extensions list are bound once at mount,
	// so they reach state through refs. `openIssuePopoverRef` is invoked
	// from `EditorView.domEventHandlers.mousedown` when the click lands on
	// a `.cm-check-issue` mark.
	const openIssuePopoverRef = useRef< ( id: string ) => void >( () => {} );

	useEffect( () => {
		void window.api.uiPrefs.get().then( ( prefs ) => {
			setSidebarOpen( prefs.draftSidebarOpen );
			setSidebarTab( prefs.draftSidebarTab );
		} );
	}, [] );

	// Rail click semantics:
	// - panel closed → open it on the clicked tab
	// - panel open, same tab clicked → close
	// - panel open, different tab → switch tab (panel stays open)
	const handleRailClick = useCallback(
		( next: DraftSidebarTab ): void => {
			if ( ! sidebarOpen ) {
				setSidebarOpen( true );
				setSidebarTab( next );
				void window.api.uiPrefs.set( {
					draftSidebarOpen: true,
					draftSidebarTab: next,
				} );
				return;
			}
			if ( next === sidebarTab ) {
				setSidebarOpen( false );
				void window.api.uiPrefs.set( { draftSidebarOpen: false } );
				return;
			}
			setSidebarTab( next );
			void window.api.uiPrefs.set( { draftSidebarTab: next } );
		},
		[ sidebarOpen, sidebarTab ]
	);

	const handleClosePanel = useCallback( (): void => {
		setSidebarOpen( false );
		void window.api.uiPrefs.set( { draftSidebarOpen: false } );
	}, [] );

	const resourcePath = `${ folder }/${ relPath }`;

	// Selection menu's "Chat" button opens the sidebar on the chat tab before
	// pinning the current selection.
	const handleOpenChatForSelection = useCallback( (): void => {
		setSidebarOpen( true );
		setSidebarTab( 'chat' );
		void window.api.uiPrefs.set( {
			draftSidebarOpen: true,
			draftSidebarTab: 'chat',
		} );
	}, [] );

	const {
		selectionInfo,
		selectionMenu,
		handleEditorFocus,
		handleEditorBlur,
		handleSelectionUpdate,
		handleAddToChat,
		handleChat,
	} = useSelectionMenu( {
		resourcePath,
		viewRef,
		scrollRef,
		onAddSelection,
		onOpenChat: handleOpenChatForSelection,
	} );

	// Push React-owned issue state down into the editor's StateField so the
	// decorations stay in lock-step. The view is recreated on draft swap, so
	// re-run on `editorView` too — otherwise a fresh view would mount with
	// no decorations until the next state change.
	useEffect( () => {
		const view = viewRef.current;
		if ( ! view ) {
			return;
		}
		view.dispatch( { effects: setIssuesEffect.of( checkIssues ) } );
	}, [ checkIssues, editorView ] );

	useEffect( () => {
		const view = viewRef.current;
		if ( ! view ) {
			return;
		}
		view.dispatch( { effects: setActiveIssueEffect.of( activeIssueId ) } );
	}, [ activeIssueId, editorView ] );

	const handleRunChecks = useCallback( async (): Promise< void > => {
		// Snapshot the (projectId, relPath, folder) tuple at send time;
		// drop the response if the editor has switched away by the time
		// it lands.
		const guard = { projectId, relPath, folder };
		setChecksRunning( true );
		setChecksErrorByCheck( {} );
		try {
			const results = await window.api.drafts.check( projectId, body );
			if (
				guard.projectId !== projectId ||
				guard.relPath !== relPath ||
				guard.folder !== folder
			) {
				return;
			}
			const allIssues: DraftCheckIssue[] = [];
			const errors: Record< string, string > = {};
			for ( const r of results ) {
				allIssues.push( ...r.issues );
				if ( r.error ) {
					errors[ r.checkRelPath ] = r.error;
				}
			}
			setCheckIssues( allIssues );
			setChecksErrorByCheck( errors );
			setActiveIssueId( null );
		} catch ( err ) {
			// eslint-disable-next-line no-console
			console.error( 'drafts.check failed', err );
			setChecksErrorByCheck( {
				'<runtime>':
					err instanceof Error ? err.message : 'Unknown error',
			} );
		} finally {
			setChecksRunning( false );
		}
	}, [ projectId, relPath, folder, body ] );

	const handleToggleCheckEnabled = useCallback(
		async ( relPathArg: string, next: boolean ): Promise< void > => {
			// Read-modify-write so we preserve `body` and any extra
			// frontmatter keys the user might have. The folder watcher
			// re-pulls `checksMeta` from the resulting write.
			const current = await window.api.checks.read(
				projectId,
				relPathArg
			);
			if ( ! current ) {
				return;
			}
			await window.api.checks.write( projectId, relPathArg, {
				title: current.title,
				enabled: next,
				body: current.body,
				frontmatter: current.frontmatter,
				expectedMtime: current.mtime,
			} );
		},
		[ projectId ]
	);

	const handleCreateCheck = useCallback( async (): Promise< void > => {
		const result = await window.api.checks.create( projectId );
		if ( result.ok ) {
			setEditingCheckRelPath( result.relPath );
		}
	}, [ projectId ] );

	const handleEditCheck = useCallback( ( relPathArg: string ): void => {
		setEditingCheckRelPath( relPathArg );
	}, [] );

	const handleDeleteCheck = useCallback(
		async ( relPathArg: string ): Promise< void > => {
			await window.api.checks.delete( projectId, relPathArg );
			if ( editingCheckRelPath === relPathArg ) {
				setEditingCheckRelPath( null );
			}
		},
		[ projectId, editingCheckRelPath ]
	);

	const handleResetCheckDefaults = useCallback( async (): Promise< void > => {
		await window.api.checks.resetDefaults( projectId );
	}, [ projectId ] );

	const renderCheckEditor = useCallback(
		( relPathArg: string ): React.ReactNode => (
			<div
				className="draft-checks-panel-editor-wrap"
				data-testid="draft-checks-editor-wrap"
			>
				<div className="draft-checks-panel-editor-header">
					<button
						type="button"
						className="check-action-button check-action-button-ghost"
						data-testid="draft-checks-editor-back"
						onClick={ () => setEditingCheckRelPath( null ) }
					>
						← Back to checks
					</button>
				</div>
				<InlineFileEditor
					projectId={ projectId }
					folder="checks"
					relPath={ relPathArg }
					name={ relPathArg }
				/>
			</div>
		),
		[ projectId ]
	);

	const openIssuePopover = useCallback( ( id: string ): void => {
		const issue = checkIssuesRef.current.find( ( i ) => i.id === id );
		const view = viewRef.current;
		if ( ! issue || ! view ) {
			return;
		}
		const position = computeAnchorPosition(
			view,
			scrollRef.current,
			issue.from,
			{ width: 280 }
		);
		setActiveIssueId( id );
		// If the issue's anchor isn't computable (e.g. line still offscreen
		// while a scrollIntoView hasn't flushed), preserve the previous
		// popover state instead of closing it. The next select call after
		// the scroll lands will set a real position.
		if ( position ) {
			setIssuePopover( { issueId: id, position } );
		}
	}, [] );

	useEffect( () => {
		openIssuePopoverRef.current = openIssuePopover;
	}, [ openIssuePopover ] );

	const handleSelectIssue = useCallback(
		( id: string ): void => {
			const issue = checkIssuesRef.current.find( ( i ) => i.id === id );
			const view = viewRef.current;
			if ( ! issue || ! view ) {
				return;
			}
			// Scroll-only — don't dispatch a selection. A non-empty editor
			// selection trips useSelectionMenu and opens the "Chat" menu
			// on top of our popover.
			const safeFrom = Math.min( issue.from, view.state.doc.length );
			view.dispatch( {
				effects: EditorView.scrollIntoView( safeFrom, { y: 'center' } ),
			} );
			// Open immediately so the popover snaps to the new issue when
			// the line is already onscreen. If it isn't, `openIssuePopover`
			// preserves the existing popover; the next RAF re-runs the
			// anchor calculation against the just-flushed scroll, so the
			// popover transitions on the same click without flashing.
			openIssuePopover( id );
			window.requestAnimationFrame( () => {
				openIssuePopover( id );
			} );
		},
		[ openIssuePopover ]
	);

	const handleClosePopover = useCallback( (): void => {
		setIssuePopover( null );
		setActiveIssueId( null );
	}, [] );

	const handleApplyIssue = useCallback( (): void => {
		if ( ! issuePopover ) {
			return;
		}
		const issue = checkIssuesRef.current.find(
			( i ) => i.id === issuePopover.issueId
		);
		const view = viewRef.current;
		if ( ! issue || ! view ) {
			return;
		}
		const docLen = view.state.doc.length;
		const safeFrom = Math.min( issue.from, docLen );
		const safeTo = Math.min( issue.to, docLen );
		view.dispatch( {
			changes: { from: safeFrom, to: safeTo, insert: issue.replacement },
			annotations: applyAnnotation.of( true ),
		} );
		const survivors = shiftIssuesAfterApply(
			checkIssuesRef.current,
			issue
		);
		setCheckIssues( survivors );
		setIssuePopover( null );
		setActiveIssueId( null );
	}, [ issuePopover ] );

	const handleDismissIssue = useCallback( (): void => {
		if ( ! issuePopover ) {
			return;
		}
		const id = issuePopover.issueId;
		setCheckIssues( ( prev ) => prev.filter( ( i ) => i.id !== id ) );
		setIssuePopover( null );
		setActiveIssueId( null );
	}, [ issuePopover ] );

	// Bulk apply: plan via `planBulkApply` (right-to-left iteration so each
	// change's offsets stay valid against the unchanged left portion of the
	// doc; overlapping issues drop out via `shiftIssuesAfterApply`) and
	// dispatch a single CodeMirror transaction so undo collapses the whole
	// batch to one step.
	const handleApplyIssues = useCallback( ( ids: string[] ): void => {
		if ( ids.length === 0 ) {
			return;
		}
		const view = viewRef.current;
		if ( ! view ) {
			return;
		}
		const { changes, survivors } = planBulkApply(
			checkIssuesRef.current,
			ids
		);
		if ( changes.length === 0 ) {
			return;
		}
		const docLen = view.state.doc.length;
		const safeChanges = changes.map( ( c ) => ( {
			from: Math.min( c.from, docLen ),
			to: Math.min( c.to, docLen ),
			insert: c.insert,
		} ) );
		view.dispatch( {
			changes: safeChanges,
			annotations: applyAnnotation.of( true ),
		} );
		setCheckIssues( survivors );
		setIssuePopover( null );
		setActiveIssueId( null );
	}, [] );

	const handleDismissIssues = useCallback( ( ids: string[] ): void => {
		if ( ids.length === 0 ) {
			return;
		}
		const idSet = new Set( ids );
		setCheckIssues( ( prev ) =>
			prev.filter( ( i ) => ! idSet.has( i.id ) )
		);
		setIssuePopover( ( prev ) =>
			prev && idSet.has( prev.issueId ) ? null : prev
		);
		setActiveIssueId( ( prev ) =>
			prev && idSet.has( prev ) ? null : prev
		);
	}, [] );

	// Outline → editor jump. Mirrors Zettlr's `jtl()`: focus the editor,
	// move the cursor to the heading line, and scroll the line to the top
	// of the viewport so the heading is visually anchored where the user
	// expects it.
	const handleOutlineJump = useCallback( ( pos: number ): void => {
		const view = viewRef.current;
		if ( ! view ) {
			return;
		}
		const safePos = Math.min( pos, view.state.doc.length );
		view.focus();
		view.dispatch( {
			selection: { anchor: safePos },
			effects: EditorView.scrollIntoView( safePos, { y: 'start' } ),
		} );
	}, [] );

	const focusTitleAtEnd = useCallback( (): void => {
		const input = titleInputRef.current;
		if ( ! input ) {
			return;
		}
		input.focus();
		const len = input.value.length;
		try {
			input.setSelectionRange( len, len );
		} catch {
			// setSelectionRange throws on type=number etc; we use type=text
			// so this should never fire — defensive only.
		}
	}, [] );

	useEffect( () => {
		let cancelled = false;
		// Force the editor mount effect to tear down + remount on draft
		// change. Without this transition the mount effect's [state.status]
		// dep stays `'ready'` across the swap and the CM6 view keeps the
		// outgoing draft's document.
		setState( { status: 'loading' } );
		setCheckIssues( [] );
		setActiveIssueId( null );
		setChecksErrorByCheck( {} );
		setChecksRunning( false );
		lastAutoRenameSlugRef.current = null;
		void window.api.drafts
			.read( projectId, relPath, { folder } )
			.then( ( result ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! result ) {
					setState( { status: 'error' } );
					return;
				}
				setState( { status: 'ready', draft: result } );
				setTitleInput( result.title );
				setBody( result.body );
				frontmatterRef.current = result.frontmatter;
				mtimeRef.current = result.mtime;
				setDisplayMtime( result.mtime );
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
	}, [ projectId, relPath, folder, reloadCounter ] );

	// `onBack` and `flush` change identity each render; the editor must be
	// mounted once per draft, so we read the latest values via a ref inside
	// the Esc / Cmd+J keymaps rather than re-mounting on every change.
	const escHandlerRef = useRef< () => void >( () => {} );
	const aiOpenHandlerRef = useRef< ( view: EditorView ) => void >( () => {} );
	const slashOpenHandlerRef = useRef< ( view: EditorView ) => void >(
		() => {}
	);

	useEffect( () => {
		if ( state.status !== 'ready' || ! hostRef.current ) {
			return;
		}
		let memoTimer: ReturnType< typeof setTimeout > | null = null;
		const flushMemo = (): void => {
			const v = viewRef.current;
			if ( ! v ) {
				return;
			}
			writeMemo( projectId, relPath, {
				cursor: v.state.selection.main.head,
				scrollTop: scrollRef.current?.scrollTop ?? 0,
			} );
		};
		const queueMemoWrite = (): void => {
			if ( memoTimer ) {
				clearTimeout( memoTimer );
			}
			memoTimer = setTimeout( flushMemo, 250 );
		};
		const view = new EditorView( {
			parent: hostRef.current,
			state: EditorState.create( {
				doc: state.draft.body,
				extensions: [
					history(),
					keymap.of( [
						...markdownFormattingBindings,
						{
							key: 'Mod-j',
							run: ( v ) => {
								aiOpenHandlerRef.current( v );
								return true;
							},
						},
						{
							key: 'Escape',
							run: () => {
								escHandlerRef.current();
								return true;
							},
						},
						// Tab/Shift+Tab. The list-aware bindings come first: when
						// the cursor is inside a ListItem/Task, Tab nests and
						// Shift+Tab outdents. They return false on non-list
						// lines, falling through to insertTab/indentLess which
						// inserts a literal tab and removes leading indent.
						// Arrow traversal title↔body. These take precedence over
						// defaultKeymap's ArrowUp/ArrowLeft so the body
						// returns focus to the title at boundaries; on
						// non-boundary positions they return false and CM's
						// normal cursor movement runs.
						{
							key: 'ArrowUp',
							run: escapeUpToTitle( focusTitleAtEnd ),
						},
						{
							key: 'ArrowLeft',
							run: escapeLeftToTitle( focusTitleAtEnd ),
						},
						...markdownTabBindings,
						{ key: 'Tab', run: insertTab, shift: indentLess },
						...markdownBlockBindings,
						// markdownKeymap covers Enter-to-continue-list and
						// related markup-aware editing. Place before defaultKeymap
						// so its Enter binding wins over the plain newline.
						...markdownKeymap,
						// closeBrackets pairs (), [], {}, "", '', ``. Its keymap
						// adds smart Backspace that deletes both characters of an
						// empty pair.
						...closeBracketsKeymap,
						// search panel: Cmd+F find, Cmd+G next, Shift+Cmd+G prev,
						// Cmd+Alt+F replace, Cmd+D select-next-occurrence, etc.
						...searchKeymap,
						// gotoLine prompts for a line number (Cmd+Alt+G).
						{ key: 'Mod-Alt-g', run: gotoLine },
						...defaultKeymap,
						...historyKeymap,
					] ),
					projectIdFacet.of( projectId ),
					// One indent unit = a real tab character so Tab and
					// Shift+Tab insert/remove the same atomic glyph the user
					// typed. With the default 2-space unit, Shift+Tab on `\t`
					// would convert it to spaces.
					indentUnit.of( '\t' ),
					// markdownLanguage = GFM (task lists, tables,
					// strikethrough, autolinks). Without it, `[ ]` parses as
					// link brackets and the LinkMark hide rule eats them.
					markdown( { base: markdownLanguage } ),
					syntaxHighlighting( defaultHighlightStyle ),
					markdownLiveDecorations,
					checkIssuesField,
					markdownTaskWidget,
					markdownImageWidget,
					emptyLinePlaceholder,
					// Intercept `/` typed on a fully-empty line and open the
					// slash command menu instead of inserting the character.
					// Mid-line `/`, list-marker lines, and whitespace-only
					// lines all fall through to normal insertion.
					EditorView.inputHandler.of( ( v, _from, _to, text ) => {
						if ( text !== '/' ) {
							return false;
						}
						const main = v.state.selection.main;
						if ( ! main.empty ) {
							return false;
						}
						const line = v.state.doc.lineAt( main.from );
						if ( line.text !== '' ) {
							return false;
						}
						slashOpenHandlerRef.current( v );
						return true;
					} ),
					// Stock CM6 niceties any prose editor expects.
					closeBrackets(),
					bracketMatching(),
					// drawSelection paints the highlight via CM's own DOM
					// nodes instead of the browser's native ::selection. The
					// native one disappears the moment focus moves to a
					// non-contenteditable element (chat textarea, sidebar tab
					// buttons, the panel × …); CM's stays visible as long as
					// state.selection has a range. Selection colours are
					// overridden in index.css with !important — CM's
					// baseTheme paints with a 5-class selector that's
					// painful to out-specify cleanly, and the &light/&dark
					// modifiers needed to match it only work in baseTheme,
					// not user themes.
					drawSelection(),
					dropCursor(),
					search( { top: true } ),
					smartSelectionWrap,
					pasteUrlAsLink,
					markdownLinkClick,
					EditorView.lineWrapping,
					EditorView.contentAttributes.of( { spellcheck: 'true' } ),
					EditorView.domEventHandlers( {
						focus: handleEditorFocus,
						blur: handleEditorBlur,
						mousedown: ( event ) => {
							// Mousedown on a text node lands on the Text, not
							// the wrapping span — guard with Node + walk up.
							const target = event.target as Node | null;
							if ( ! target ) {
								return false;
							}
							const el =
								target instanceof Element
									? target
									: target.parentElement;
							const mark = el?.closest(
								'.cm-check-issue'
							) as HTMLElement | null;
							if ( ! mark ) {
								return false;
							}
							const id = mark.getAttribute( 'data-issue-id' );
							if ( ! id ) {
								return false;
							}
							event.preventDefault();
							openIssuePopoverRef.current( id );
							return true;
						},
					} ),
					EditorView.updateListener.of( ( u ) => {
						if ( u.docChanged ) {
							setBody( u.state.doc.toString() );
							const next = extractHeadings( u.state );
							setHeadings( ( prev ) =>
								headingsEqual( prev, next ) ? prev : next
							);
							// Any manual edit invalidates the check
							// results — they were computed against an
							// older doc. Apply transactions carry an
							// annotation so we skip clearing for them.
							const isApply =
								u.transactions.some( isApplyTransaction );
							if (
								! isApply &&
								checkIssuesRef.current.length > 0
							) {
								setCheckIssues( [] );
								setActiveIssueId( null );
								setIssuePopover( null );
								u.view.dispatch( {
									effects: clearIssuesEffect.of( null ),
								} );
							}
						}
						if ( u.selectionSet || u.docChanged ) {
							const head = u.state.selection.main.head;
							const line = u.state.doc.lineAt( head ).number;
							setCursorLine( ( prev ) =>
								prev === line ? prev : line
							);
							handleSelectionUpdate( u );
							queueMemoWrite();
						}
						// History depth changes on edits and on undo/redo —
						// both surface as transactions, so check on any.
						if ( u.transactions.length > 0 ) {
							const canUndo = undoDepth( u.state ) > 0;
							const canRedo = redoDepth( u.state ) > 0;
							setHistoryState( ( prev ) =>
								prev.canUndo === canUndo &&
								prev.canRedo === canRedo
									? prev
									: { canUndo, canRedo }
							);
						}
					} ),
				],
			} ),
		} );
		viewRef.current = view;
		setEditorView( view );
		// Seed the outline from the freshly-mounted state so the panel isn't
		// empty until the first edit lands.
		setHeadings( extractHeadings( view.state ) );
		setCursorLine(
			view.state.doc.lineAt( view.state.selection.main.head ).number
		);
		// Open every draft with the title focused and the page at the top.
		// The saved cursor is still restored into the body state so that
		// arrowing down from the title lands where the user left off, but
		// we don't focus or auto-scroll the body — that would push the
		// title out of view.
		const memo = readMemo( projectId, relPath );
		if (
			memo &&
			memo.cursor >= 0 &&
			memo.cursor <= view.state.doc.length
		) {
			view.dispatch( {
				selection: { anchor: memo.cursor },
			} );
		}
		if ( scrollRef.current ) {
			scrollRef.current.scrollTop = 0;
		}
		const titleEl = titleInputRef.current;
		if ( titleEl ) {
			titleEl.focus();
			const len = titleEl.value.length;
			try {
				titleEl.setSelectionRange( len, len );
			} catch {
				// setSelectionRange throws on non-text inputs; this one
				// is type=text so this is defensive only.
			}
		}
		return () => {
			if ( memoTimer ) {
				clearTimeout( memoTimer );
			}
			flushMemo();
			view.destroy();
			viewRef.current = null;
			setEditorView( null );
		};
		// Mount once per (projectId, relPath); subsequent state edits flow
		// through the updateListener rather than re-creating the view.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ state.status ] );

	const snapshot = useMemo< Snapshot >(
		() => ( { title: titleInput, body } ),
		[ titleInput, body ]
	);

	const save = useCallback(
		async ( s: Snapshot ): Promise< 'ok' | 'error' > => {
			const result = await window.api.drafts.write( projectId, relPath, {
				title: s.title,
				body: s.body,
				frontmatter: frontmatterRef.current,
				expectedMtime: mtimeRef.current,
				folder,
			} );
			if ( result.ok ) {
				mtimeRef.current = result.mtime;
				setDisplayMtime( result.mtime );
				return 'ok';
			}
			return 'error';
		},
		[ projectId, relPath, folder ]
	);

	const { state: saveState, flush } = useAutoSave< Snapshot >( {
		value: snapshot,
		enabled: state.status === 'ready',
		save,
		eq: snapshotEq,
	} );

	// Mirrored so the file-watcher handler (subscribed once per
	// projectId/relPath) reads the latest save state without re-subscribing.
	const saveStateRef = useRef( saveState );
	useEffect( () => {
		saveStateRef.current = saveState;
	}, [ saveState ] );

	// Watch the open draft for external changes (agent edits, terminal
	// edits). On change: ignore if it matches our own last-save mtime
	// (self-write); ignore if there are unsaved local edits (would clobber
	// the user's work); otherwise bump reloadCounter to re-run the load
	// effect, which reloads from disk and remounts the editor.
	useEffect( () => {
		void window.api.drafts.watch( projectId, relPath, { folder } );
		const off = window.api.drafts.onFileChanged( ( event ) => {
			if ( event.projectId !== projectId || event.relPath !== relPath ) {
				return;
			}
			if ( event.mtime !== null && event.mtime === mtimeRef.current ) {
				return;
			}
			const s = saveStateRef.current;
			if ( s !== 'idle' && s !== 'saved' ) {
				// eslint-disable-next-line no-console
				console.warn(
					'[draft-editor] external change while dirty, skipping reload'
				);
				return;
			}
			setReloadCounter( ( c ) => c + 1 );
		} );
		return () => {
			off();
			void window.api.drafts.unwatch();
		};
	}, [ projectId, relPath, folder ] );

	const handleBack = useCallback( async (): Promise< void > => {
		await flush();
		onBack();
	}, [ flush, onBack ] );

	const handleRequestDelete = useCallback( (): void => {
		const trimmed = titleInput.trim();
		setPendingDeletion( { name: trimmed.length > 0 ? trimmed : relPath } );
	}, [ titleInput, relPath ] );

	const handleCancelDelete = useCallback( (): void => {
		if ( deleting ) {
			return;
		}
		setPendingDeletion( null );
	}, [ deleting ] );

	// Cross-cutting renderer-side state to update after a successful rename:
	//   - editor cursor / scroll memory keyed by the old relPath
	//   - frontmatterRef so the next save mirrors what the rename channel
	//     wrote to disk (manual rename → autoRename:false; auto-rename →
	//     no autoRename field)
	//   - mtimeRef so the next save passes the mtime conflict guard
	//   - App.tsx editingDraft.relPath so sidebar entries and re-renders
	//     pick up the new path
	const applyRenameResult = useCallback(
		(
			oldRelPath: string,
			newRelPath: string,
			mtime: number,
			markManual: boolean
		): void => {
			migrateMemo( projectId, oldRelPath, newRelPath );
			const nextFrontmatter = { ...frontmatterRef.current };
			if ( markManual ) {
				nextFrontmatter.autoRename = false;
			} else {
				delete nextFrontmatter.autoRename;
			}
			frontmatterRef.current = nextFrontmatter;
			mtimeRef.current = mtime;
			setDisplayMtime( mtime );
			lastAutoRenameSlugRef.current = newRelPath.replace( /\.md$/i, '' );
			if ( oldRelPath !== newRelPath ) {
				onRelPathChanged( newRelPath );
			}
		},
		[ projectId, onRelPathChanged ]
	);

	// Auto-rename from the current title. Fires on title blur / Enter unless
	// the user has pinned the filename via a manual rename (frontmatter
	// `autoRename: false`). Flushes any pending body+title autosave first
	// so the renamed file's frontmatter is current — otherwise the rename
	// channel would move a stale file. No-op when nothing about the slug
	// changes (same basename, suppressed via flag, all-punctuation title).
	const maybeAutoRenameRef = useRef< () => Promise< void > >(
		async () => {}
	);
	useEffect( () => {
		maybeAutoRenameRef.current = async () => {
			if ( state.status !== 'ready' ) {
				return;
			}
			const fm = frontmatterRef.current;
			if ( fm.autoRename === false ) {
				return;
			}
			const slug = slugifyTitle( titleInput );
			if ( ! slug ) {
				return;
			}
			const currentBasename = relPath.replace( /\.md$/i, '' );
			if ( slug === currentBasename ) {
				return;
			}
			if ( lastAutoRenameSlugRef.current === slug ) {
				return;
			}
			lastAutoRenameSlugRef.current = slug;
			// Flush the title save before we move the file. If the title
			// hasn't been written yet, the rename would carry over the old
			// frontmatter `title:` and the renamed file would briefly
			// disagree with the user's input until the next autosave.
			await flush();
			const result = await window.api.drafts.rename(
				projectId,
				relPath,
				titleInput,
				{ markManual: false, folder }
			);
			if ( ! result.ok ) {
				lastAutoRenameSlugRef.current = null;
				// eslint-disable-next-line no-console
				console.error(
					'auto-rename failed',
					'reason' in result ? result.reason : 'unknown'
				);
				return;
			}
			applyRenameResult( relPath, result.relPath, result.mtime, false );
		};
	}, [
		state.status,
		titleInput,
		projectId,
		relPath,
		folder,
		flush,
		applyRenameResult,
	] );

	const handleRequestRename = useCallback( (): void => {
		setRenameDialog( { open: true, busy: false, error: null } );
	}, [] );

	const handleCancelRename = useCallback( (): void => {
		setRenameDialog( ( prev ) =>
			prev.busy ? prev : { open: false, busy: false, error: null }
		);
	}, [] );

	const handleConfirmRename = useCallback(
		async ( desired: string ): Promise< void > => {
			setRenameDialog( ( prev ) => ( {
				...prev,
				busy: true,
				error: null,
			} ) );
			await flush();
			const result = await window.api.drafts.rename(
				projectId,
				relPath,
				desired,
				{ markManual: true, folder }
			);
			if ( ! result.ok ) {
				const reason = 'reason' in result ? result.reason : 'io-error';
				setRenameDialog( {
					open: true,
					busy: false,
					error:
						reason === 'not-found'
							? 'io-error'
							: ( reason as
									| 'invalid-name'
									| 'collision'
									| 'io-error' ),
				} );
				return;
			}
			applyRenameResult( relPath, result.relPath, result.mtime, true );
			setRenameDialog( { open: false, busy: false, error: null } );
		},
		[ projectId, relPath, folder, flush, applyRenameResult ]
	);

	const handleConfirmDelete = useCallback( async (): Promise< void > => {
		setDeleting( true );
		const result = await window.api.resources.delete(
			projectId,
			folder,
			relPath
		);
		if ( result.ok ) {
			// Skip flush on the way out — flushing a deleted file would
			// recreate it. handleBack() flushes; bypass it here.
			onBack();
			return;
		}
		setDeleting( false );
		setPendingDeletion( null );
		// No toast surface yet; fall back to console so the failure isn't
		// silent during dev. Once a notification system lands this should
		// surface to the user instead. The `'reason' in result` guard is
		// only here because the project ts config doesn't enable strict
		// mode, which would narrow `result` after the early return above.
		// eslint-disable-next-line no-console
		console.error(
			'draft delete failed',
			'reason' in result ? result.reason : 'unknown'
		);
	}, [ projectId, relPath, folder, onBack ] );

	useEffect( () => {
		escHandlerRef.current = () => {
			if ( slashMenu.open ) {
				setSlashMenu( { open: false, position: null } );
				return;
			}
			if ( aiMenu.open ) {
				setAiMenu( { open: false, position: null } );
				return;
			}
			void handleBack();
		};
	}, [ handleBack, aiMenu.open, slashMenu.open ] );

	useEffect( () => {
		aiOpenHandlerRef.current = ( view: EditorView ) => {
			const head = view.state.selection.main.head;
			const rect = view.coordsAtPos( head );
			if ( ! rect ) {
				return;
			}
			setAiMenu( {
				open: true,
				position: { top: rect.bottom + 4, left: rect.left },
			} );
		};
	}, [] );

	useEffect( () => {
		slashOpenHandlerRef.current = ( view: EditorView ) => {
			const head = view.state.selection.main.head;
			const rect = view.coordsAtPos( head );
			if ( ! rect ) {
				return;
			}
			const line = view.state.doc.lineAt( head );
			slashTriggerLineRef.current = { from: line.from, to: line.to };
			setSlashMenu( {
				open: true,
				position: { top: rect.bottom + 4, left: rect.left },
			} );
		};
	}, [] );

	const closeAiMenu = useCallback( (): void => {
		setAiMenu( { open: false, position: null } );
	}, [] );

	const closeSlashMenu = useCallback( (): void => {
		setSlashMenu( { open: false, position: null } );
	}, [] );

	// Hand raw bytes to the main process which dedups by content hash, then
	// dispatch a CM6 transaction inserting `![alt](assets/<hash>.<ext>)` at
	// the requested position. Markdown stays portable (relative paths only);
	// the renderer reaches the file via the studio-asset:// protocol. Used
	// by paste, drop, and the slash menu's Image action.
	//
	// `leadingNewline` controls whether a `\n` is prepended:
	//  - true (paste/drop): the insert lands mid-paragraph, so we need a
	//    newline before the image to push it onto its own line.
	//  - false (slash menu on an empty line): the line is already empty,
	//    a leading `\n` would sprout a blank gap above the image.
	// A trailing `\n` is always added so the cursor lands on the line
	// *after* the image — keeping the cursor on the image's own line
	// would suppress the widget (it only renders when the line is
	// inactive).
	const insertImageAt = useCallback(
		async (
			file: File,
			atPos: number,
			leadingNewline: boolean = true
		): Promise< void > => {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array( buf );
			let binary = '';
			// String.fromCharCode with apply is faster than .map+join for small
			// payloads and sidesteps spread-arg argument-count limits via chunks.
			const chunkSize = 0x8000;
			for ( let i = 0; i < bytes.length; i += chunkSize ) {
				binary += String.fromCharCode.apply(
					null,
					Array.from( bytes.subarray( i, i + chunkSize ) )
				);
			}
			const dataB64 = window.btoa( binary );
			const result = await window.api.drafts.saveImage( projectId, {
				mimeType: file.type,
				dataB64,
				originalFilename: file.name,
			} );
			if ( ! result.ok || ! viewRef.current ) {
				return;
			}
			const view = viewRef.current;
			const altText = file.name.replace( /\.[^.]+$/, '' );
			const md = `![${ altText }](${ result.relPath })`;
			const insert = `${ leadingNewline ? '\n' : '' }${ md }\n`;
			// Clamp in case the doc shrank during the IPC round-trip.
			const safePos = Math.min( atPos, view.state.doc.length );
			view.dispatch( {
				changes: { from: safePos, insert },
				selection: { anchor: safePos + insert.length },
			} );
		},
		[ projectId ]
	);

	const SLASH_BLOCK_PREFIXES: Partial< Record< SlashAction, string > > = {
		quote: '> ',
		h1: '# ',
		h2: '## ',
		h3: '### ',
		h4: '#### ',
	};

	const handleSlashSelect = useCallback(
		( action: SlashAction ): void => {
			setSlashMenu( { open: false, position: null } );
			const view = viewRef.current;
			if ( ! view ) {
				return;
			}
			view.focus();
			const trigger = slashTriggerLineRef.current;
			if ( ! trigger ) {
				return;
			}
			const safeFrom = Math.min( trigger.from, view.state.doc.length );
			const safeTo = Math.min( trigger.to, view.state.doc.length );
			if ( action === 'image' ) {
				// Pick + save round-trips through main so the OS dialog can
				// open with the project folder as defaultPath — HTML
				// <input type=file> can't set a starting directory.
				void ( async () => {
					const result =
						await window.api.drafts.pickImage( projectId );
					if ( ! result.ok ) {
						return;
					}
					const v = viewRef.current;
					if ( ! v ) {
						return;
					}
					const altText = result.fileName.replace( /\.[^.]+$/, '' );
					const insert = `![${ altText }](${ result.relPath })\n`;
					const safePos = Math.min( safeFrom, v.state.doc.length );
					v.dispatch( {
						changes: { from: safePos, to: safeTo, insert },
						selection: { anchor: safePos + insert.length },
					} );
				} )();
				return;
			}
			if ( action === 'divider' ) {
				// `---` followed by a newline so the cursor lands on the line
				// after the rule, ready for the next paragraph. The trigger
				// line is empty by construction, so we don't need a leading
				// blank line for the rule to parse.
				const insert = '---\n';
				view.dispatch( {
					changes: { from: safeFrom, to: safeTo, insert },
					selection: { anchor: safeFrom + insert.length },
				} );
				return;
			}
			const prefix = SLASH_BLOCK_PREFIXES[ action ];
			if ( ! prefix ) {
				return;
			}
			view.dispatch( {
				changes: { from: safeFrom, to: safeTo, insert: prefix },
				selection: { anchor: safeFrom + prefix.length },
			} );
		},
		// SLASH_BLOCK_PREFIXES is a stable literal — pulling it into deps
		// would require useMemo gymnastics for no behavioral gain.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ projectId ]
	);

	// Close the menu when the editor scrolls — the anchor coords would drift
	// otherwise. Cheaper than tracking the cursor through scroll events.
	useEffect( () => {
		if ( ! aiMenu.open ) {
			return;
		}
		const scroller = scrollRef.current;
		if ( ! scroller ) {
			return;
		}
		const onScroll = (): void => closeAiMenu();
		scroller.addEventListener( 'scroll', onScroll, { passive: true } );
		return () => scroller.removeEventListener( 'scroll', onScroll );
	}, [ aiMenu.open, closeAiMenu ] );

	useEffect( () => {
		if ( ! slashMenu.open ) {
			return;
		}
		const scroller = scrollRef.current;
		if ( ! scroller ) {
			return;
		}
		const onScroll = (): void => closeSlashMenu();
		scroller.addEventListener( 'scroll', onScroll, { passive: true } );
		return () => scroller.removeEventListener( 'scroll', onScroll );
	}, [ slashMenu.open, closeSlashMenu ] );

	useEffect( () => {
		if ( ! issuePopover ) {
			return;
		}
		const scroller = scrollRef.current;
		if ( ! scroller ) {
			return;
		}
		const onScroll = (): void => handleClosePopover();
		scroller.addEventListener( 'scroll', onScroll, { passive: true } );
		return () => scroller.removeEventListener( 'scroll', onScroll );
	}, [ issuePopover, handleClosePopover ] );

	const docStats = useMemo( () => {
		const words = countWords( body );
		return {
			words,
			chars: countChars( body ),
			minutes: readingMinutes( words ),
		};
	}, [ body ] );

	// Paste / drop image insertion: routes through `insertImageAt` above.
	useEffect( () => {
		if ( state.status !== 'ready' ) {
			return;
		}
		const host = hostRef.current;
		if ( ! host ) {
			return;
		}
		const insertImage = insertImageAt;
		const onPaste = ( e: ClipboardEvent ): void => {
			const items = Array.from( e.clipboardData?.items ?? [] );
			const images = items
				.filter(
					( it ) =>
						it.kind === 'file' && it.type.startsWith( 'image/' )
				)
				.map( ( it ) => it.getAsFile() )
				.filter( ( f ): f is File => f !== null );
			if ( images.length > 0 ) {
				e.preventDefault();
				const view = viewRef.current;
				if ( ! view ) {
					return;
				}
				// Paste has no spatial coordinates; insert at the cursor.
				const pos = view.state.selection.main.head;
				for ( const f of images ) {
					void insertImage( f, pos );
				}
				return;
			}
			const html = e.clipboardData?.getData( 'text/html' ) ?? '';
			const plain = e.clipboardData?.getData( 'text/plain' ) ?? '';
			if ( ! html || html === plain ) {
				return;
			}
			e.preventDefault();
			htmlToMarkdown( html )
				.then( ( md ) => {
					const view = viewRef.current;
					if ( ! view ) {
						return;
					}
					view.dispatch( view.state.replaceSelection( md ), {
						scrollIntoView: true,
					} );
				} )
				.catch( ( err ) =>
					// eslint-disable-next-line no-console
					console.error( 'paste->markdown failed', err )
				);
		};
		const onDrop = ( e: DragEvent ): void => {
			const files = Array.from( e.dataTransfer?.files ?? [] ).filter(
				( f ) => f.type.startsWith( 'image/' )
			);
			if ( files.length === 0 ) {
				return;
			}
			e.preventDefault();
			const view = viewRef.current;
			if ( ! view ) {
				return;
			}
			// Drop position comes from the event coords — what the user
			// saw under the dropCursor — not the stale text cursor.
			const dropPos =
				view.posAtCoords( {
					x: e.clientX,
					y: e.clientY,
				} ) ?? view.state.selection.main.head;
			for ( const f of files ) {
				void insertImage( f, dropPos );
			}
		};
		const onDragOver = ( e: DragEvent ): void => {
			if (
				Array.from( e.dataTransfer?.items ?? [] ).some( ( it ) =>
					it.type.startsWith( 'image/' )
				)
			) {
				e.preventDefault();
			}
		};
		// Capture phase so we run before CodeMirror's own paste handler on
		// .cm-content — calling preventDefault() there causes CM to skip its
		// default plain-text insertion, leaving the field clear for our
		// HTML→Markdown insert.
		host.addEventListener( 'paste', onPaste, { capture: true } );
		host.addEventListener( 'drop', onDrop );
		host.addEventListener( 'dragover', onDragOver );
		return () => {
			host.removeEventListener( 'paste', onPaste, { capture: true } );
			host.removeEventListener( 'drop', onDrop );
			host.removeEventListener( 'dragover', onDragOver );
		};
	}, [ state.status, insertImageAt ] );

	return (
		<section
			className="draft-editor-screen"
			data-testid="screen-draft-editor"
			aria-label="Draft editor"
		>
			{ titlebarSlot &&
				createPortal(
					<>
						<button
							type="button"
							className="draft-editor-back"
							data-testid="draft-editor-back"
							aria-label="Back to project"
							title="Back to project"
							onClick={ () => {
								void handleBack();
							} }
						>
							<span aria-hidden="true">←</span>
						</button>
						<div
							className="draft-editor-file-info"
							data-testid="draft-editor-file-info"
						>
							<span
								className="draft-editor-file-name"
								title={ relPath }
							>
								{ relPath.split( '/' ).pop() || relPath }
							</span>
							<span
								className="draft-editor-folder-badge"
								data-folder={ folder }
							>
								{ FOLDER_LABEL[ folder ] ?? folder }
							</span>
							{ displayMtime !== null && (
								<span className="draft-editor-file-date">
									{ relativeDate( displayMtime ) }
								</span>
							) }
						</div>
						<div
							className="draft-editor-toolbar-slot"
							data-testid="draft-editor-toolbar-slot"
						>
							<FormattingToolbar
								view={ editorView }
								visible={ selectionInfo !== null }
								canUndo={ historyState.canUndo }
								canRedo={ historyState.canRedo }
							/>
						</div>
						<span
							className="draft-editor-word-count"
							data-testid="draft-editor-word-count"
							title={
								selectionInfo
									? `${ selectionInfo.words.toLocaleString() } words · ${ selectionInfo.chars.toLocaleString() } characters in selection`
									: `${ docStats.words.toLocaleString() } words · ${ docStats.chars.toLocaleString() } characters · ~${
											docStats.minutes
									  } min read`
							}
							data-mode={
								selectionInfo ? 'selection' : 'document'
							}
						>
							{ selectionInfo
								? `${ selectionInfo.words.toLocaleString() } selected · ${ selectionInfo.chars.toLocaleString() } chars`
								: `${ docStats.words.toLocaleString() } words · ~${
										docStats.minutes
								  } min` }
						</span>
						<span
							className="draft-editor-status"
							data-testid="draft-editor-status"
							data-state={ saveState }
						/>
						<DraftEditorActionMenu
							onRename={ handleRequestRename }
							onDelete={ handleRequestDelete }
							onAddToChat={ onAddToChat }
							onOpenNewChat={ onOpenNewChat }
						/>
					</>,
					titlebarSlot
				) }
			<div className="draft-editor-body" data-testid="draft-editor-body">
				<div className="draft-editor-main">
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
							ref={ scrollRef }
							className="draft-editor-scroll"
							data-testid="draft-editor-scroll"
						>
							<div className="draft-editor-title-container">
								<input
									ref={ titleInputRef }
									type="text"
									className="draft-editor-title-input"
									data-testid="draft-editor-title-input"
									aria-label="Draft title"
									placeholder="Untitled"
									value={ titleInput }
									onChange={ ( e ) =>
										setTitleInput( e.target.value )
									}
									onBlur={ () => {
										void maybeAutoRenameRef.current();
									} }
									onKeyDown={ ( e ) => {
										const moveToBody = (): void => {
											e.preventDefault();
											const view = viewRef.current;
											if ( ! view ) {
												return;
											}
											view.focus();
											view.dispatch( {
												selection: { anchor: 0 },
											} );
										};
										if (
											e.key === 'ArrowDown' ||
											e.key === 'Enter'
										) {
											moveToBody();
											return;
										}
										if (
											e.key === 'ArrowRight' &&
											e.currentTarget.selectionStart ===
												e.currentTarget.value.length &&
											e.currentTarget.selectionEnd ===
												e.currentTarget.value.length
										) {
											moveToBody();
										}
									} }
								/>
							</div>
							<div
								ref={ hostRef }
								className="draft-editor-host"
								data-testid="draft-editor-host"
								data-status="ready"
							/>
						</div>
					) }
					<AiMenu
						open={ aiMenu.open }
						position={ aiMenu.position }
						onClose={ closeAiMenu }
					/>
					<SlashMenu
						open={ slashMenu.open }
						position={ slashMenu.position }
						onSelect={ handleSlashSelect }
						onClose={ closeSlashMenu }
					/>
					<SelectionMenu
						open={
							selectionMenu.open &&
							! issuePopover &&
							! ( sidebarOpen && sidebarTab === 'checks' )
						}
						position={ selectionMenu.position }
						mode={
							sidebarOpen && sidebarTab === 'chat'
								? 'chat-open'
								: 'idle'
						}
						onAddToChat={ handleAddToChat }
						onChat={ handleChat }
					/>
					{ issuePopover &&
						( () => {
							const issue = checkIssues.find(
								( i ) => i.id === issuePopover.issueId
							);
							if ( ! issue ) {
								return null;
							}
							return (
								<CheckIssuePopover
									issue={ issue }
									position={ issuePopover.position }
									onApply={ handleApplyIssue }
									onDismiss={ handleDismissIssue }
									onClose={ handleClosePopover }
								/>
							);
						} )() }
				</div>
				<DraftSidebar
					open={ sidebarOpen }
					tab={ sidebarTab }
					onTabClick={ handleRailClick }
					onClose={ handleClosePanel }
					projectId={ projectId }
					docKind={ docKind }
					relPath={ relPath }
					folder={ folder }
					body={ body }
					openResource={ openResource }
					addedSelections={ pendingSelections }
					onClearAddedSelections={ onClearPendingSelections }
					pendingAttachments={ pendingAttachments }
					onRemovePendingAttachment={ onRemovePendingAttachment }
					headings={ headings }
					cursorLine={ cursorLine }
					onOutlineJump={ handleOutlineJump }
					onMarkedDone={ onBack }
					onPublishedAndMoved={ onPublishedAndMoved }
					checksMeta={ checksMeta }
					checkIssues={ checkIssues }
					activeIssueId={ activeIssueId }
					checksRunning={ checksRunning }
					checksErrorByCheck={ checksErrorByCheck }
					editingCheckRelPath={ editingCheckRelPath }
					onRunChecks={ () => {
						void handleRunChecks();
					} }
					onToggleCheckEnabled={ ( rp, next ) => {
						void handleToggleCheckEnabled( rp, next );
					} }
					onCreateCheck={ () => {
						void handleCreateCheck();
					} }
					onEditCheck={ handleEditCheck }
					onDeleteCheck={ ( rp ) => {
						void handleDeleteCheck( rp );
					} }
					onResetCheckDefaults={ () => {
						void handleResetCheckDefaults();
					} }
					onSelectIssue={ handleSelectIssue }
					onApplyIssues={ handleApplyIssues }
					onDismissIssues={ handleDismissIssues }
					renderCheckEditor={ renderCheckEditor }
					chats={ chats }
					activeChatId={ activeChatId }
					messages={ messages }
					busy={ busy }
					permissions={ permissions }
					onSelectChat={ onSelectChat }
					onNewChat={ onNewChat }
					onDeleteChat={ onDeleteChat }
					onSend={ onSend }
					onCancelChat={ onCancelChat }
					onPermissionDecision={ onPermissionDecision }
					onAttachResources={ onAttachResources }
					onDropOsFilesToChat={ onDropOsFilesToChat }
					onPreviewAttachment={ onPreviewAttachment }
				/>
			</div>
			<DeleteResourceDialog
				pending={ pendingDeletion }
				deleting={ deleting }
				onConfirm={ () => {
					void handleConfirmDelete();
				} }
				onCancel={ handleCancelDelete }
			/>
			<RenameDraftDialog
				open={ renameDialog.open }
				currentBasename={ relPath.replace( /\.md$/i, '' ) }
				busy={ renameDialog.busy }
				error={ renameDialog.error }
				onConfirm={ ( desired ) => {
					void handleConfirmRename( desired );
				} }
				onCancel={ handleCancelRename }
			/>
		</section>
	);
}
