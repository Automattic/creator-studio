import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChatHistoryPopover } from './ChatHistoryPopover';
import {
	DraftChatPanel,
	type AddedSelection,
	type QuickAction,
} from './DraftChatPanel';
import { type ChatMessage } from './ChatTranscript';
import { type PermissionRequest } from './PermissionPrompt';
import { DraftChecksPanel } from './DraftChecksPanel';
import { CoachPanel, type CoachRewriteState } from './CoachPanel';
import { DraftHistoryPanel } from './DraftHistoryPanel';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import { DraftSharePanel } from './DraftSharePanel';
import { ProjectTasksPanel } from './ProjectTasksPanel';
import { ResetChecksDefaultsDialog } from './ResetChecksDefaultsDialog';
import {
	ChatIcon,
	ChecksIcon,
	CloseIcon,
	CoachIcon,
	HistoryIcon,
	MoreIcon,
	OutlineIcon,
	PlusIcon,
	ShareIcon,
	TasksIcon,
} from '../icons';
import { computeChatLabels } from '../lib/chat-labels';
import type { Heading } from '../editor/markdown-outline';
import type {
	ChatMeta,
	CoachIssue,
	CoachIssueCategory,
	CoachRegister,
	CoachRewriteAction,
	CoachScoreDimension,
	CoachStructureNote,
	CurrentView,
	DraftAttachment,
	DraftCheckIssue,
	DraftCheckMeta,
	DraftSidebarTab,
	MessageSelection,
	OpenResource,
	TaskDefinition,
	TaskRun,
} from '../../types';

export type { CoachRewriteState };

export type { AddedSelection };

const PROJECT_QUICK_ACTIONS: QuickAction[] = [
	{ label: 'Discuss a new draft', prompt: 'Discuss a new draft' },
	{
		label: 'What can I write from these?',
		prompt: 'What can I write from these?',
	},
];

const EDITOR_QUICK_ACTIONS: QuickAction[] = [
	{ label: 'Make it shorter', prompt: 'Make it shorter' },
	{ label: 'Improve clarity', prompt: 'Improve clarity' },
	{
		label: 'Suggest a stronger opening',
		prompt: 'Suggest a stronger opening',
	},
];

type Props = {
	open: boolean;
	tab: DraftSidebarTab;
	onTabClick: ( tab: DraftSidebarTab ) => void;
	onClose: () => void;
	projectId: string;
	// What kind of document the middle pane is showing. Drives rail
	// visibility: outline, checks, and share appear only for a draft or
	// done doc.
	docKind?: 'draft' | 'done' | null;
	relPath?: string;
	folder?: 'sources' | 'drafts' | 'done' | 'checks';
	body?: string;
	addedSelections?: AddedSelection[];
	onClearAddedSelections?: () => void;
	pendingAttachments?: DraftAttachment[];
	// What the user is looking at, silently appended to outgoing prompts so
	// "expand this draft" / "summarize this note" reach the agent with a
	// concrete file reference. Not rendered — invisible context.
	openResource?: OpenResource | null;
	// Where the user is when no file is open. Mentioned by the composer
	// in the agent preamble so prompts like "what's in this folder?"
	// reach the agent with a concrete location. Invisible to the user.
	currentView?: CurrentView | null;
	onRemovePendingAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
	headings?: Heading[];
	cursorLine?: number;
	onOutlineJump?: ( pos: number ) => void;
	onMarkedDone?: () => void;
	onPublishedAndMoved?: ( newRelPath: string ) => void;

	// Checks tab — owned by DraftEditorScreen so the editor decorations and
	// the panel rows share a single source of truth.
	checksMeta?: DraftCheckMeta[];
	checkIssues?: DraftCheckIssue[];
	activeIssueId?: string | null;
	checksRunning?: boolean;
	checksErrorByCheck?: Record< string, string >;
	onRunChecks?: () => void;
	onToggleCheckEnabled?: ( relPath: string, next: boolean ) => void;
	onCreateCheck?: () => void;
	onEditCheck?: ( relPath: string ) => void;
	onDeleteCheck?: ( relPath: string ) => void;
	onResetCheckDefaults?: () => void;
	onSelectIssue?: ( id: string ) => void;
	onApplyIssues?: ( ids: string[] ) => void;
	onDismissIssues?: ( ids: string[] ) => void;
	// Project view passes this so each row becomes a button that opens the
	// check in the host's middle panel. The draft-editor sidebar omits it so
	// rows keep their enable/disable checkbox (the toggle is meaningful when
	// there's a draft body to run checks against).
	onOpenCheck?: ( relPath: string ) => void;

	// History tab — the active snapshot is owned by the parent screen so the
	// main editor pane can swap to the diff view when a snapshot is picked.
	selectedHistoryId?: string | null;
	onSelectHistorySnapshot?: ( id: string | null ) => void;

	// Coach tab — owned by DraftEditorScreen, same single-source-of-truth
	// pattern as checks: the editor decorations and the panel rows read the
	// same issue list.
	coachIssues?: CoachIssue[];
	coachVisibleCategories?: Record< CoachIssueCategory, boolean >;
	coachActiveIssueId?: string | null;
	coachScanning?: boolean;
	coachScanError?: string | null;
	coachHasScanned?: boolean;
	coachSelectionLabel?: string;
	coachHasSelection?: boolean;
	coachRewrite?: CoachRewriteState;
	coachRegister?: CoachRegister | null;
	coachVoiceReady?: boolean;
	coachStructureNotes?: CoachStructureNote[];
	coachStructureRunning?: boolean;
	coachStructureError?: string | null;
	coachHasStructure?: boolean;
	onCoachReviewStructure?: () => void;
	onCoachSelectStructureNote?: ( id: string ) => void;
	coachScoreDimensions?: CoachScoreDimension[];
	coachScoreRunning?: boolean;
	coachScoreError?: string | null;
	onCoachScore?: () => void;
	onCoachScan?: () => void;
	onCoachToggleCategory?: ( category: CoachIssueCategory ) => void;
	onCoachSelectIssue?: ( id: string ) => void;
	onCoachApplyIssues?: ( ids: string[] ) => void;
	onCoachDismissIssues?: ( ids: string[] ) => void;
	onCoachRewrite?: ( action: CoachRewriteAction ) => void;
	onCoachApplyCandidate?: ( text: string ) => void;
	onCoachClearRewrite?: () => void;
	// Tasks tab — the project's runs / definitions and callbacks, owned by
	// App. Optional; the tab simply shows an empty state when omitted.
	taskRuns?: TaskRun[];
	taskDefs?: TaskDefinition[];
	taskProjectName?: string;
	onOpenTaskRun?: ( run: TaskRun ) => void;
	onStopTaskRun?: ( runId: string ) => void;
	onRunTaskDefinition?: ( defId: string ) => void;
	onEditTaskDefinition?: ( def: TaskDefinition ) => void;
	onDeleteTaskDefinition?: ( def: TaskDefinition ) => void;
	onNewTask?: () => void;

	// Chat surface — the project's chats, filtered messages/permissions for
	// the active chat, and callbacks. All owned by App so the project view
	// and the draft sidebar stay in sync without local duplication.
	chats: ChatMeta[];
	activeChatId: string | null;
	messages: ChatMessage[];
	busy: boolean;
	permissions: PermissionRequest[];
	onSelectChat: ( chatId: string ) => void;
	onNewChat: () => void;
	onDeleteChat: ( chatId: string ) => void;
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
	// Voice state for the empty-state CTA inside the chat panel.
	voiceAction?: 'create' | 'update' | null;
	onCreateOrUpdateVoice?: ( action: 'create' | 'update' ) => void;
	// Called when the user clicks the pinned-file chip at the top of a
	// voice chat. The parent opens voice.md in the editor.
	onOpenVoiceFile?: () => void;
	panelWidth?: number;
	onPanelWidthChange?: ( width: number ) => void;
};

const TABS: ReadonlyArray< {
	id: DraftSidebarTab;
	label: string;
	Icon: typeof ChatIcon;
} > = [
	{ id: 'chat', label: 'Chat', Icon: ChatIcon },
	{ id: 'checks', label: 'Checks', Icon: ChecksIcon },
	{ id: 'tasks', label: 'Tasks', Icon: TasksIcon },
	{ id: 'outline', label: 'Outline', Icon: OutlineIcon },
	{ id: 'coach', label: 'Coach', Icon: CoachIcon },
	{ id: 'history', label: 'History', Icon: HistoryIcon },
	{ id: 'share', label: 'Share', Icon: ShareIcon },
];

// Visibility is contextual: outline + share + coach + history only make
// sense for a draft or done document. Chat and checks are always visible —
// checks are project-scoped resources, editable from project view too.
const DOC_ONLY_TABS = new Set< DraftSidebarTab >( [
	'outline',
	'share',
	'coach',
	'history',
] );

function isTabVisible(
	tabId: DraftSidebarTab,
	docKind: 'draft' | 'done' | null | undefined
): boolean {
	if ( DOC_ONLY_TABS.has( tabId ) ) {
		return docKind === 'draft' || docKind === 'done';
	}
	return true;
}

export function isDraftSidebarTabEnabled(
	tabId: DraftSidebarTab,
	docKind: 'draft' | 'done' | null | undefined
): boolean {
	return isTabEnabled( tabId, docKind );
}

function isTabEnabled(
	tabId: DraftSidebarTab,
	docKind: 'draft' | 'done' | null | undefined
): boolean {
	return isTabVisible( tabId, docKind );
}

export function DraftSidebar( {
	open,
	tab,
	onTabClick,
	onClose,
	projectId,
	docKind = 'draft',
	relPath = '',
	folder = 'drafts',
	body = '',
	addedSelections = [],
	onClearAddedSelections = () => {},
	pendingAttachments,
	openResource = null,
	currentView = null,
	onRemovePendingAttachment,
	onPreviewAttachment,
	headings = [],
	cursorLine = 0,
	onOutlineJump = () => {},
	onMarkedDone = () => {},
	onPublishedAndMoved,
	checksMeta = [],
	checkIssues = [],
	activeIssueId = null,
	checksRunning = false,
	checksErrorByCheck = {},
	onRunChecks,
	onToggleCheckEnabled,
	onCreateCheck,
	onEditCheck,
	onDeleteCheck,
	onResetCheckDefaults,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
	onOpenCheck,
	coachIssues = [],
	coachVisibleCategories = {
		grammar: true,
		clarity: true,
		ai: true,
		voice: true,
	},
	coachActiveIssueId = null,
	coachScanning = false,
	coachScanError = null,
	coachHasScanned = false,
	coachSelectionLabel = '',
	coachHasSelection = false,
	coachRewrite = { status: 'idle' },
	coachRegister = null,
	coachVoiceReady = false,
	coachStructureNotes = [],
	coachStructureRunning = false,
	coachStructureError = null,
	coachHasStructure = false,
	onCoachReviewStructure,
	onCoachSelectStructureNote,
	coachScoreDimensions = [],
	coachScoreRunning = false,
	coachScoreError = null,
	onCoachScore,
	onCoachScan,
	onCoachToggleCategory,
	onCoachSelectIssue,
	onCoachApplyIssues,
	onCoachDismissIssues,
	onCoachRewrite,
	onCoachApplyCandidate,
	onCoachClearRewrite,
	chats,
	activeChatId,
	messages,
	busy,
	permissions,
	onSelectChat,
	onNewChat,
	onDeleteChat,
	onSend,
	onCancelChat,
	onPermissionDecision,
	onAttachResources,
	onDropOsFilesToChat,
	voiceAction,
	onCreateOrUpdateVoice,
	onOpenVoiceFile,
	panelWidth,
	onPanelWidthChange,
	selectedHistoryId = null,
	onSelectHistorySnapshot = () => {},
	taskRuns = [],
	taskDefs = [],
	taskProjectName = '',
	onOpenTaskRun = () => {},
	onStopTaskRun = () => {},
	onRunTaskDefinition = () => {},
	onEditTaskDefinition = () => {},
	onDeleteTaskDefinition = () => {},
	onNewTask = () => {},
}: Props ): React.ReactElement {
	// Tasks rail badge — a paused run needing attention wins over a plain
	// running run.
	const activeTaskRuns = taskRuns.filter(
		( r ) =>
			r.status === 'running' ||
			r.status === 'queued' ||
			r.status === 'needs-permission'
	);
	let taskBadge: 'permission' | 'running' | null = null;
	if ( activeTaskRuns.some( ( r ) => r.status === 'needs-permission' ) ) {
		taskBadge = 'permission';
	} else if ( activeTaskRuns.length > 0 ) {
		taskBadge = 'running';
	}
	// If the persisted tab is hidden or disabled for the current doc, fall
	// back to chat so the panel body and rail highlight stay in sync. The
	// caller's `tab` state isn't mutated — it'll resume when context returns.
	const effectiveTab: DraftSidebarTab = isTabEnabled( tab, docKind )
		? tab
		: 'chat';
	const activeLabel =
		TABS.find( ( t ) => t.id === effectiveTab )?.label ?? '';
	const [ historyOpen, setHistoryOpen ] = useState( false );
	const historyRef = useRef< HTMLDivElement | null >( null );
	const [ checksMenuOpen, setChecksMenuOpen ] = useState( false );
	const [ resetDialogOpen, setResetDialogOpen ] = useState( false );
	const checksMenuRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! checksMenuOpen ) {
			return;
		}
		const handler = ( e: MouseEvent ): void => {
			if (
				checksMenuRef.current &&
				! checksMenuRef.current.contains( e.target as Node )
			) {
				setChecksMenuOpen( false );
			}
		};
		document.addEventListener( 'mousedown', handler );
		return () => document.removeEventListener( 'mousedown', handler );
	}, [ checksMenuOpen ] );

	const MIN_PANEL_WIDTH = 260;
	const DEFAULT_PANEL_WIDTH = 320;
	const RAIL_WIDTH = 44;

	const sidebarRef = useRef< HTMLElement | null >( null );
	const startXRef = useRef( 0 );
	const startWidthRef = useRef( DEFAULT_PANEL_WIDTH );
	const [ liveWidth, setLiveWidth ] = useState< number | null >( null );
	const isResizing = liveWidth !== null;

	const onResizeStart = useCallback(
		( e: React.MouseEvent ) => {
			if ( ! open ) {
				return;
			}
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = panelWidth ?? DEFAULT_PANEL_WIDTH;

			const container = sidebarRef.current?.parentElement;
			const maxWidth = container
				? Math.floor( container.clientWidth * 0.7 ) - RAIL_WIDTH
				: 600;

			const onMove = ( ev: MouseEvent ): void => {
				const delta = startXRef.current - ev.clientX;
				const next = Math.max(
					MIN_PANEL_WIDTH,
					Math.min( maxWidth, startWidthRef.current + delta )
				);
				setLiveWidth( next );
			};

			const onUp = (): void => {
				document.removeEventListener( 'mousemove', onMove );
				document.removeEventListener( 'mouseup', onUp );
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
				setLiveWidth( ( w ) => {
					if ( w !== null ) {
						onPanelWidthChange?.( w );
					}
					return null;
				} );
			};

			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			document.addEventListener( 'mousemove', onMove );
			document.addEventListener( 'mouseup', onUp );
		},
		[ open, panelWidth, onPanelWidthChange ]
	);

	const resolvedWidth = liveWidth ?? panelWidth ?? DEFAULT_PANEL_WIDTH;

	const chatLabels = computeChatLabels( chats );
	const historyChats = [ ...chats ].sort( ( a, b ) => {
		const aAt = a.lastMessageAt ?? a.createdAt;
		const bAt = b.lastMessageAt ?? b.createdAt;
		return bAt - aAt;
	} );

	const activeChat = chats.find( ( c ) => c.id === activeChatId );
	const isVoiceChat =
		activeChat?.title === 'Voice setup' ||
		activeChat?.title === 'Voice update';
	const pinnedFile =
		isVoiceChat && onOpenVoiceFile
			? {
					folder: 'checks' as const,
					relPath: 'voice.md',
					label: 'voice.md',
					onClick: onOpenVoiceFile,
			  }
			: null;

	return (
		<aside
			ref={ sidebarRef }
			className="draft-sidebar"
			data-testid="draft-sidebar"
			data-open={ open ? 'true' : 'false' }
			data-resizing={ isResizing ? 'true' : undefined }
			aria-label="Draft sidebar"
		>
			{ open && (
				/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */
				<div
					className="draft-sidebar-resize-handle"
					onMouseDown={ onResizeStart }
				/>
			) }
			<div
				className="draft-sidebar-panel"
				data-testid="draft-sidebar-panel"
				aria-hidden={ ! open }
				style={
					open
						? {
								flexBasis: resolvedWidth,
								width: resolvedWidth,
						  }
						: undefined
				}
			>
				<header className="draft-sidebar-panel-header">
					<h2 className="draft-sidebar-panel-title">
						{ activeLabel }
					</h2>
					{ effectiveTab === 'chat' && (
						<div className="draft-sidebar-panel-actions">
							<button
								type="button"
								className="draft-sidebar-panel-action"
								data-testid="draft-chat-add"
								aria-label="New chat"
								title="New chat"
								onClick={ () => {
									setHistoryOpen( false );
									onNewChat();
								} }
							>
								<PlusIcon size={ 14 } />
							</button>
							<div
								className="chat-history-wrap"
								ref={ historyRef }
							>
								<button
									type="button"
									className="draft-sidebar-panel-action"
									data-testid="draft-chat-history"
									aria-label="Chat history"
									aria-haspopup="listbox"
									aria-expanded={ historyOpen }
									title="Chat history"
									onClick={ () =>
										setHistoryOpen( ( v ) => ! v )
									}
								>
									<HistoryIcon size={ 14 } />
								</button>
								{ historyOpen && (
									<ChatHistoryPopover
										chats={ historyChats }
										activeChatId={ activeChatId }
										chatLabels={ chatLabels }
										onSelect={ ( id ) => {
											onSelectChat( id );
											setHistoryOpen( false );
										} }
										onDelete={ ( id ) => {
											onDeleteChat( id );
										} }
										undeletableChatIds={
											chats.length === 1 &&
											messages.length === 0
												? new Set( [ chats[ 0 ].id ] )
												: undefined
										}
										onClose={ () =>
											setHistoryOpen( false )
										}
										testIdPrefix="draft-chat-history"
										boundaryRef={ historyRef }
									/>
								) }
							</div>
						</div>
					) }
					{ effectiveTab === 'checks' && (
						<div className="draft-sidebar-panel-actions">
							<button
								type="button"
								className="draft-sidebar-panel-action"
								data-testid="draft-checks-new"
								aria-label="New check"
								title="New check"
								onClick={ () => onCreateCheck?.() }
							>
								<PlusIcon size={ 14 } />
							</button>
							<div
								className="draft-checks-panel-menu-wrap"
								ref={ checksMenuRef }
							>
								<button
									type="button"
									className="draft-sidebar-panel-action"
									data-testid="draft-checks-menu"
									aria-haspopup="menu"
									aria-expanded={ checksMenuOpen }
									aria-label="More actions"
									title="More actions"
									onClick={ () =>
										setChecksMenuOpen( ( v ) => ! v )
									}
								>
									<MoreIcon size={ 16 } />
								</button>
								{ checksMenuOpen && (
									<div
										className="draft-checks-panel-menu"
										role="menu"
									>
										<button
											type="button"
											role="menuitem"
											className="draft-checks-panel-menu-item"
											data-testid="draft-checks-reset-defaults"
											onClick={ () => {
												setChecksMenuOpen( false );
												setResetDialogOpen( true );
											} }
										>
											Reset to defaults
										</button>
									</div>
								) }
							</div>
						</div>
					) }
					{ effectiveTab === 'tasks' && (
						<div className="draft-sidebar-panel-actions">
							<button
								type="button"
								className="draft-sidebar-panel-action"
								data-testid="tasks-new-task"
								aria-label="New task"
								title="New task"
								onClick={ () => onNewTask() }
							>
								<PlusIcon size={ 14 } />
							</button>
						</div>
					) }
					<button
						type="button"
						className="draft-sidebar-panel-close"
						data-testid="draft-sidebar-close"
						aria-label="Close panel"
						onClick={ onClose }
					>
						<CloseIcon size={ 16 } />
					</button>
				</header>
				<div
					className="draft-sidebar-panel-body"
					data-testid="draft-sidebar-body"
					data-tab={ effectiveTab }
				>
					{ effectiveTab === 'chat' && (
						<DraftChatPanel
							chatId={ activeChatId }
							messages={ messages }
							busy={ busy }
							permissions={ permissions }
							addedSelections={ addedSelections }
							onClearAddedSelections={ onClearAddedSelections }
							pendingAttachments={ pendingAttachments }
							openResource={ openResource }
							currentView={ currentView }
							placeholder={
								openResource
									? 'Ask for an edit on this file…'
									: 'Ask about this project…'
							}
							quickActions={
								openResource
									? EDITOR_QUICK_ACTIONS
									: PROJECT_QUICK_ACTIONS
							}
							welcomeText={
								openResource
									? 'How can I help with this?'
									: 'What would you like to write?'
							}
							voiceAction={ voiceAction }
							onCreateOrUpdateVoice={ onCreateOrUpdateVoice }
							onRemovePendingAttachment={
								onRemovePendingAttachment
							}
							onPreviewAttachment={ onPreviewAttachment }
							onSend={ onSend }
							onCancel={ onCancelChat }
							onPermissionDecision={ onPermissionDecision }
							onAttachResources={ onAttachResources }
							onDropOsFilesToChat={ onDropOsFilesToChat }
							pinnedFile={ pinnedFile }
						/>
					) }
					{ effectiveTab === 'checks' && (
						<DraftChecksPanel
							checks={ checksMeta }
							issues={ checkIssues }
							activeIssueId={ activeIssueId }
							running={ checksRunning }
							errorByCheck={ checksErrorByCheck }
							onToggleEnabled={ onToggleCheckEnabled }
							onRun={ onRunChecks }
							onEditCheck={ onEditCheck }
							onDeleteCheck={ onDeleteCheck }
							onSelectIssue={ onSelectIssue }
							onApplyIssues={ onApplyIssues }
							onDismissIssues={ onDismissIssues }
							onOpenCheck={ onOpenCheck }
						/>
					) }
					{ effectiveTab === 'coach' && (
						<CoachPanel
							issues={ coachIssues }
							body={ body }
							register={ coachRegister }
							visibleCategories={ coachVisibleCategories }
							onToggleCategory={ ( c ) =>
								onCoachToggleCategory?.( c )
							}
							activeIssueId={ coachActiveIssueId }
							scanning={ coachScanning }
							scanError={ coachScanError }
							hasScanned={ coachHasScanned }
							onScan={ () => onCoachScan?.() }
							onSelectIssue={ ( id ) =>
								onCoachSelectIssue?.( id )
							}
							onApplyIssues={ ( ids ) =>
								onCoachApplyIssues?.( ids )
							}
							onDismissIssues={ ( ids ) =>
								onCoachDismissIssues?.( ids )
							}
							scoreDimensions={ coachScoreDimensions }
							scoreRunning={ coachScoreRunning }
							scoreError={ coachScoreError }
							onScore={ () => onCoachScore?.() }
							selectionLabel={ coachSelectionLabel }
							hasSelection={ coachHasSelection }
							rewrite={ coachRewrite }
							onRewrite={ ( a ) => onCoachRewrite?.( a ) }
							onApplyCandidate={ ( t ) =>
								onCoachApplyCandidate?.( t )
							}
							onClearRewrite={ () => onCoachClearRewrite?.() }
							voiceReady={ coachVoiceReady }
							onSetUpVoice={ () =>
								onCreateOrUpdateVoice?.( 'create' )
							}
							structureNotes={ coachStructureNotes }
							structureRunning={ coachStructureRunning }
							structureError={ coachStructureError }
							hasStructure={ coachHasStructure }
							onReviewStructure={ () =>
								onCoachReviewStructure?.()
							}
							onSelectStructureNote={ ( id ) =>
								onCoachSelectStructureNote?.( id )
							}
						/>
					) }
					{ effectiveTab === 'tasks' && (
						<ProjectTasksPanel
							projectName={ taskProjectName }
							runs={ taskRuns }
							definitions={ taskDefs }
							onOpenRun={ onOpenTaskRun }
							onStopRun={ onStopTaskRun }
							onRunDefinition={ onRunTaskDefinition }
							onEditDefinition={ onEditTaskDefinition }
							onDeleteDefinition={ onDeleteTaskDefinition }
						/>
					) }
					{ effectiveTab === 'outline' && (
						<DraftOutlinePanel
							headings={ headings }
							cursorLine={ cursorLine }
							onJump={ onOutlineJump }
						/>
					) }
					{ effectiveTab === 'share' && (
						<DraftSharePanel
							body={ body }
							relPath={ relPath }
							projectId={ projectId }
							folder={ folder }
							onMarkedDone={ onMarkedDone }
							onPublishedAndMoved={ onPublishedAndMoved }
						/>
					) }
					{ effectiveTab === 'history' && (
						<DraftHistoryPanel
							projectId={ projectId }
							relPath={ relPath }
							folder={ folder }
							selectedSnapshotId={ selectedHistoryId }
							onSelectSnapshot={ onSelectHistorySnapshot }
						/>
					) }
				</div>
			</div>
			<div
				className="draft-sidebar-rail"
				role="tablist"
				aria-label="Draft sections"
			>
				{ TABS.filter( ( t ) => isTabVisible( t.id, docKind ) ).map(
					( t, i, arr ) => {
						const isActive = open && effectiveTab === t.id;
						const disabled = ! isTabEnabled( t.id, docKind );
						// Extra gap before the first doc-only tab to
						// visually separate project-scoped from
						// document-scoped items.
						const prevTab = arr[ i - 1 ];
						const needsSpacer =
							DOC_ONLY_TABS.has( t.id ) &&
							prevTab &&
							! DOC_ONLY_TABS.has( prevTab.id );
						return (
							<button
								style={
									needsSpacer ? { marginTop: 12 } : undefined
								}
								key={ t.id }
								type="button"
								role="tab"
								className="draft-sidebar-rail-btn"
								data-testid={ `draft-sidebar-tab-${ t.id }` }
								data-active={ isActive ? 'true' : 'false' }
								aria-selected={ isActive }
								aria-label={ t.label }
								title={ t.label }
								disabled={ disabled }
								onClick={ () =>
									! disabled && onTabClick( t.id )
								}
							>
								<t.Icon size={ 18 } />
								{ t.id === 'tasks' && taskBadge && (
									<span
										className="draft-sidebar-rail-badge"
										data-attention={ taskBadge }
										aria-hidden="true"
									/>
								) }
							</button>
						);
					}
				) }
			</div>
			{ resetDialogOpen && (
				<ResetChecksDefaultsDialog
					onCancel={ () => setResetDialogOpen( false ) }
					onConfirm={ () => {
						setResetDialogOpen( false );
						onResetCheckDefaults?.();
					} }
				/>
			) }
		</aside>
	);
}
