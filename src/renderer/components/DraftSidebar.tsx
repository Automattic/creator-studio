import React, { useRef, useState } from 'react';

import { ChatHistoryPopover } from './ChatHistoryPopover';
import { DraftChatPanel, type AddedSelection } from './DraftChatPanel';
import { type ChatMessage } from './ChatTranscript';
import { type PermissionRequest } from './PermissionPrompt';
import { DraftChecksPanel } from './DraftChecksPanel';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import { DraftSharePanel } from './DraftSharePanel';
import {
	ChatIcon,
	ChecksIcon,
	CloseIcon,
	HistoryIcon,
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
	// visibility: outline + share appear only for a draft or done doc,
	// and checks is only enabled while a draft is open.
	docKind?: 'draft' | 'done' | null;
	relPath?: string;
	folder?: 'drafts' | 'done';
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
];

// Visibility is contextual: outline + share only make sense for a draft or
// done document; checks is always present but only enabled while a draft is
// open. Chat is always visible and enabled.
const DOC_ONLY_TABS = new Set< DraftSidebarTab >( [ 'outline', 'share' ] );

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
	if ( ! isTabVisible( tabId, docKind ) ) {
		return false;
	}
	if ( tabId === 'checks' ) {
		return docKind === 'draft';
	}
	return true;
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

	const chatLabels = computeChatLabels( chats );
	const historyChats = [ ...chats ].sort( ( a, b ) => {
		const aAt = a.lastMessageAt ?? a.createdAt;
		const bAt = b.lastMessageAt ?? b.createdAt;
		return bAt - aAt;
	} );

	return (
		<aside
			className="draft-sidebar"
			data-testid="draft-sidebar"
			data-open={ open ? 'true' : 'false' }
			aria-label="Draft sidebar"
		>
			<div
				className="draft-sidebar-panel"
				data-testid="draft-sidebar-panel"
				aria-hidden={ ! open }
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
							onRemovePendingAttachment={
								onRemovePendingAttachment
							}
							onPreviewAttachment={ onPreviewAttachment }
							onSend={ onSend }
							onCancel={ onCancelChat }
							onPermissionDecision={ onPermissionDecision }
							onAttachResources={ onAttachResources }
							onDropOsFilesToChat={ onDropOsFilesToChat }
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
							onCreateCheck={ onCreateCheck }
							onEditCheck={ onEditCheck }
							onDeleteCheck={ onDeleteCheck }
							onResetDefaults={ onResetCheckDefaults }
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
		</aside>
	);
}
