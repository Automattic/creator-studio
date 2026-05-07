import React, { useEffect, useRef, useState } from 'react';

import { ChatHistoryPopover } from './ChatHistoryPopover';
import { DraftChatPanel, type AddedSelection } from './DraftChatPanel';
import { DraftChecksPanel } from './DraftChecksPanel';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import { DraftSamePanel } from './DraftSamePanel';
import { DraftSharePanel } from './DraftSharePanel';
import {
	ChatIcon,
	ChecksIcon,
	CloseIcon,
	HistoryIcon,
	OutlineIcon,
	PlusIcon,
	SamePanelsIcon,
	ShareIcon,
} from '../icons';
import { computeChatLabels } from '../lib/chat-labels';
import type { Heading } from '../editor/markdown-outline';
import type { ChatMeta, Draft, DraftSidebarTab } from '../../types';

export type { AddedSelection };

type Props = {
	open: boolean;
	tab: DraftSidebarTab;
	onTabClick: ( tab: DraftSidebarTab ) => void;
	onClose: () => void;
	projectId: string;
	projectName: string;
	relPath: string;
	folder: 'drafts' | 'done';
	body: string;
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
	headings: Heading[];
	cursorLine: number;
	onOutlineJump: ( pos: number ) => void;
	peerDrafts: Draft[];
	onOpenPeerDraft: ( draft: Draft ) => void;
	onOpenProjectCanvas: () => void;
	onMarkedDone: () => void;
};

const TABS: ReadonlyArray< {
	id: DraftSidebarTab;
	label: string;
	Icon: typeof ChatIcon;
} > = [
	{ id: 'same-project', label: 'Same project', Icon: SamePanelsIcon },
	{ id: 'outline', label: 'Outline', Icon: OutlineIcon },
	{ id: 'chat', label: 'Chat', Icon: ChatIcon },
	{ id: 'checks', label: 'Checks', Icon: ChecksIcon },
	{ id: 'share', label: 'Share', Icon: ShareIcon },
];

export function DraftSidebar( {
	open,
	tab,
	onTabClick,
	onClose,
	projectId,
	projectName,
	relPath,
	folder,
	body,
	addedSelections,
	onClearAddedSelections,
	headings,
	cursorLine,
	onOutlineJump,
	peerDrafts,
	onOpenPeerDraft,
	onOpenProjectCanvas,
	onMarkedDone,
}: Props ): React.ReactElement {
	const activeLabel = TABS.find( ( t ) => t.id === tab )?.label ?? '';
	const [ activeChatId, setActiveChatId ] = useState< string | null >( null );
	const [ chats, setChats ] = useState< ChatMeta[] >( [] );
	const [ historyOpen, setHistoryOpen ] = useState( false );
	const historyRef = useRef< HTMLDivElement | null >( null );

	// On project change: load the full project chat list and pick the most
	// recently active one as the initial selection. Auto-create a chat if
	// none exist yet so the composer is immediately usable.
	useEffect( () => {
		let cancelled = false;
		setActiveChatId( null );
		setChats( [] );
		setHistoryOpen( false );
		void ( async () => {
			try {
				let list = await window.api.chats.list( projectId );
				if ( cancelled ) {
					return;
				}
				if ( list.length === 0 ) {
					const created = await window.api.chat.create( projectId );
					if ( cancelled ) {
						return;
					}
					if ( created ) {
						list = [ created ];
					}
				}
				const sorted = [ ...list ].sort( ( a, b ) => {
					const aAt = a.lastMessageAt ?? a.createdAt;
					const bAt = b.lastMessageAt ?? b.createdAt;
					return bAt - aAt;
				} );
				setChats( list );
				setActiveChatId( sorted[ 0 ]?.id ?? null );
			} catch ( err ) {
				// eslint-disable-next-line no-console
				console.error( 'draft-sidebar chat bootstrap failed', err );
			}
		} )();
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	const handleNewChat = async (): Promise< void > => {
		const created = await window.api.chat.create( projectId );
		if ( ! created ) {
			return;
		}
		setChats( ( prev ) => [ ...prev, created ] );
		setActiveChatId( created.id );
		setHistoryOpen( false );
	};

	const handleSelectChat = ( chatId: string ): void => {
		setActiveChatId( chatId );
	};

	const handleDeleteChat = async ( chatId: string ): Promise< void > => {
		const removed = await window.api.chat.remove( projectId, chatId );
		if ( ! removed ) {
			return;
		}
		const remaining = chats.filter( ( c ) => c.id !== chatId );
		setChats( remaining );
		if ( activeChatId !== chatId ) {
			return;
		}
		// Active chat was deleted — fall back to the most-recent remaining,
		// or create a new project chat so the panel never sits without an
		// active chat.
		if ( remaining.length > 0 ) {
			const sorted = [ ...remaining ].sort( ( a, b ) => {
				const aAt = a.lastMessageAt ?? a.createdAt;
				const bAt = b.lastMessageAt ?? b.createdAt;
				return bAt - aAt;
			} );
			setActiveChatId( sorted[ 0 ].id );
			return;
		}
		const created = await window.api.chat.create( projectId );
		if ( ! created ) {
			return;
		}
		setChats( [ created ] );
		setActiveChatId( created.id );
	};

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
									void handleNewChat();
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
										onSelect={ handleSelectChat }
										onDelete={ ( id ) => {
											void handleDeleteChat( id );
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
							projectId={ projectId }
							relPath={ relPath }
							chatId={ activeChatId }
							addedSelections={ addedSelections }
							onClearAddedSelections={ onClearAddedSelections }
						/>
					) }
					{ tab === 'checks' && <DraftChecksPanel /> }
					{ tab === 'outline' && (
						<DraftOutlinePanel
							headings={ headings }
							cursorLine={ cursorLine }
							onJump={ onOutlineJump }
						/>
					) }
					{ tab === 'same-project' && (
						<DraftSamePanel
							projectId={ projectId }
							projectName={ projectName }
							currentRelPath={ relPath }
							drafts={ peerDrafts }
							onOpenDraft={ onOpenPeerDraft }
							onOpenProjectCanvas={ onOpenProjectCanvas }
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
							onClick={ () => onTabClick( t.id ) }
						>
							<t.Icon size={ 18 } />
						</button>
					);
				} ) }
			</div>
		</aside>
	);
}
