import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChatHistoryPopover } from './ChatHistoryPopover';
import { DraftChatPanel, type AddedSelection } from './DraftChatPanel';
import { type ChatMessage } from './ChatTranscript';
import { type PermissionRequest } from './PermissionPrompt';
import { DraftChecksPanel } from './DraftChecksPanel';
import { DraftHistoryPanel } from './DraftHistoryPanel';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import { DraftSharePanel } from './DraftSharePanel';
import { ResetChecksDefaultsDialog } from './ResetChecksDefaultsDialog';
import {
	ChatIcon,
	ChecksIcon,
	CloseIcon,
	HistoryIcon,
	MoreIcon,
	OutlineIcon,
	PlusIcon,
	ShareIcon,
} from '../icons';
import { computeChatLabels } from '../lib/chat-labels';
import type { Heading } from '../editor/markdown-outline';
import type {
	ChatMeta,
	CurrentView,
	DraftAttachment,
	DraftCheckIssue,
	DraftCheckMeta,
	DraftSidebarTab,
	MessageSelection,
	OpenResource,
} from '../../types';

export type { AddedSelection };

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
	editingCheckRelPath?: string | null;
	onRunChecks?: () => void;
	onToggleCheckEnabled?: ( relPath: string, next: boolean ) => void;
	onCreateCheck?: () => void;
	onEditCheck?: ( relPath: string ) => void;
	onDeleteCheck?: ( relPath: string ) => void;
	onResetCheckDefaults?: () => void;
	onSelectIssue?: ( id: string ) => void;
	onApplyIssues?: ( ids: string[] ) => void;
	onDismissIssues?: ( ids: string[] ) => void;
	renderCheckEditor?: ( relPath: string ) => React.ReactNode;

	// History tab — the active snapshot is owned by the parent screen so the
	// main editor pane can swap to the diff view when a snapshot is picked.
	selectedHistoryId?: string | null;
	onSelectHistorySnapshot?: ( id: string | null ) => void;

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
	{ id: 'outline', label: 'Outline', Icon: OutlineIcon },
	{ id: 'checks', label: 'Checks', Icon: ChecksIcon },
	{ id: 'share', label: 'Share', Icon: ShareIcon },
	{ id: 'history', label: 'History', Icon: HistoryIcon },
];

// Visibility is contextual: outline + share + history only make sense for a
// draft or done document. Chat and checks are always visible — checks are
// project-scoped resources, so they're editable from project view too.
const DOC_ONLY_TABS = new Set< DraftSidebarTab >( [
	'outline',
	'share',
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
	editingCheckRelPath = null,
	onRunChecks,
	onToggleCheckEnabled,
	onCreateCheck,
	onEditCheck,
	onDeleteCheck,
	onResetCheckDefaults,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
	renderCheckEditor,
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
}: Props ): React.ReactElement {
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
					{ effectiveTab === 'checks' && ! editingCheckRelPath && (
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
							isProjectView={
								docKind === null || docKind === undefined
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
							editingRelPath={ editingCheckRelPath }
							onToggleEnabled={ onToggleCheckEnabled }
							onRun={ onRunChecks }
							onEditCheck={ onEditCheck }
							onDeleteCheck={ onDeleteCheck }
							onSelectIssue={ onSelectIssue }
							onApplyIssues={ onApplyIssues }
							onDismissIssues={ onDismissIssues }
							renderEditor={ renderCheckEditor }
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
					( t ) => {
						const isActive = open && effectiveTab === t.id;
						const disabled = ! isTabEnabled( t.id, docKind );
						return (
							<button
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
