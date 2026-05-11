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
	DraftCheckIssue,
	DraftCheckKind,
	DraftSidebarTab,
	MessageSelection,
} from '../../types';

export type { AddedSelection };

type Props = {
	open: boolean;
	tab: DraftSidebarTab;
	onTabClick: ( tab: DraftSidebarTab ) => void;
	onClose: () => void;
	projectId: string;
	// Whether a draft file is currently open/being edited. When false the
	// outline, checks, and share tabs are shown but disabled.
	draftOpen?: boolean;
	relPath?: string;
	folder?: 'drafts' | 'done';
	body?: string;
	addedSelections?: AddedSelection[];
	onClearAddedSelections?: () => void;
	headings?: Heading[];
	cursorLine?: number;
	onOutlineJump?: ( pos: number ) => void;
	onMarkedDone?: () => void;

	// Checks tab — owned by DraftEditorScreen so the editor decorations and
	// the panel rows share a single source of truth.
	checkIssues?: DraftCheckIssue[];
	activeIssueId?: string | null;
	checksRunning?: boolean;
	checksErrorByKind?: Partial< Record< DraftCheckKind, string > >;
	onRunChecks?: ( kinds: DraftCheckKind[] ) => void;
	onSelectIssue?: ( id: string ) => void;

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
		}
	) => void;
	onCancelChat: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
};

const TABS: ReadonlyArray< {
	id: DraftSidebarTab;
	label: string;
	Icon: typeof ChatIcon;
} > = [
	{ id: 'outline', label: 'Outline', Icon: OutlineIcon },
	{ id: 'chat', label: 'Chat', Icon: ChatIcon },
	{ id: 'checks', label: 'Checks', Icon: ChecksIcon },
	{ id: 'share', label: 'Share', Icon: ShareIcon },
];

const DRAFT_ONLY_TABS = new Set< DraftSidebarTab >( [
	'outline',
	'checks',
	'share',
] );

export function DraftSidebar( {
	open,
	tab,
	onTabClick,
	onClose,
	projectId,
	draftOpen = true,
	relPath = '',
	folder = 'drafts',
	body = '',
	addedSelections = [],
	onClearAddedSelections = () => {},
	headings = [],
	cursorLine = 0,
	onOutlineJump = () => {},
	onMarkedDone = () => {},
	checkIssues = [],
	activeIssueId = null,
	checksRunning = false,
	checksErrorByKind = {},
	onRunChecks,
	onSelectIssue,
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
}: Props ): React.ReactElement {
	const activeLabel = TABS.find( ( t ) => t.id === tab )?.label ?? '';
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
					{ tab === 'chat' && (
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
					data-tab={ tab }
				>
					{ tab === 'chat' && (
						<DraftChatPanel
							chatId={ activeChatId }
							messages={ messages }
							busy={ busy }
							permissions={ permissions }
							addedSelections={ addedSelections }
							onClearAddedSelections={ onClearAddedSelections }
							onSend={ onSend }
							onCancel={ onCancelChat }
							onPermissionDecision={ onPermissionDecision }
						/>
					) }
					{ tab === 'checks' && (
						<DraftChecksPanel
							issues={ checkIssues }
							activeIssueId={ activeIssueId }
							running={ checksRunning }
							errorByKind={ checksErrorByKind }
							onRun={ onRunChecks }
							onSelectIssue={ onSelectIssue }
						/>
					) }
					{ tab === 'outline' && (
						<DraftOutlinePanel
							headings={ headings }
							cursorLine={ cursorLine }
							onJump={ onOutlineJump }
						/>
					) }
					{ tab === 'share' && (
						<DraftSharePanel
							body={ body }
							relPath={ relPath }
							projectId={ projectId }
							folder={ folder }
							onMarkedDone={ onMarkedDone }
						/>
					) }
				</div>
			</div>
			<div
				className="draft-sidebar-rail"
				role="tablist"
				aria-label="Draft sections"
			>
				{ TABS.map( ( t ) => {
					const isActive = open && tab === t.id;
					const disabled = ! draftOpen && DRAFT_ONLY_TABS.has( t.id );
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
							onClick={ () => ! disabled && onTabClick( t.id ) }
						>
							<t.Icon size={ 18 } />
						</button>
					);
				} ) }
			</div>
		</aside>
	);
}
