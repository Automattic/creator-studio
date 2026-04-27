import React from 'react';
import { Menu } from '@base-ui/react/menu';

import {
	DraftsIcon,
	FolderIcon,
	FolderPlusIcon,
	PlusIcon,
	SidebarToggleIcon,
	TasksIcon,
} from './icons';

import type { ChatKind, RecentChat } from '../../types';

export type View = 'projects' | 'tasks' | 'drafts' | 'chat';

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkFolder: () => void;
	recentChats: RecentChat[];
	activeFolderId: string | null;
	activeChatId: string | null;
	onSelectRecent: ( folderId: string, chatId: string ) => void;
	activeView: View;
	onSelectView: ( view: View ) => void;
};

const KIND_LABEL: Record< ChatKind, string > = {
	general: 'Chat',
	ideas: 'Ideas',
	draft: 'Draft',
};

export function Sidebar( {
	isOpen,
	onToggle,
	onLinkFolder,
	recentChats,
	activeFolderId,
	activeChatId,
	onSelectRecent,
	activeView,
	onSelectView,
}: SidebarProps ): React.ReactElement {
	return (
		<aside
			className={ `sidebar${ isOpen ? '' : ' sidebar-closed' }` }
			data-testid="sidebar"
			data-open={ isOpen ? 'true' : 'false' }
			aria-hidden={ isOpen ? undefined : true }
		>
			<div className="sidebar-inner">
				<div className="sidebar-top" data-testid="sidebar-top">
					<div className="sidebar-title">Creator Studio</div>
					<div className="sidebar-top-actions">
						<Menu.Root>
							<Menu.Trigger
								className="sidebar-icon-btn"
								data-testid="sidebar-add"
								aria-label="Add"
								title="Add"
								tabIndex={ isOpen ? 0 : -1 }
							>
								<PlusIcon />
							</Menu.Trigger>
							<Menu.Portal>
								<Menu.Positioner
									side="bottom"
									align="end"
									sideOffset={ 6 }
								>
									<Menu.Popup
										className="menu-popup"
										data-testid="sidebar-add-menu"
									>
										<Menu.Item
											className="menu-item"
											data-testid="sidebar-add-menu-link-folder"
											onClick={ onLinkFolder }
										>
											<FolderPlusIcon />
											<span>Link folder</span>
										</Menu.Item>
									</Menu.Popup>
								</Menu.Positioner>
							</Menu.Portal>
						</Menu.Root>
						<button
							type="button"
							className="sidebar-icon-btn"
							data-testid="sidebar-toggle"
							aria-label="Hide sidebar"
							title="Hide sidebar"
							onClick={ onToggle }
							tabIndex={ isOpen ? 0 : -1 }
						>
							<SidebarToggleIcon />
						</button>
					</div>
				</div>
				<nav className="sidebar-nav" aria-label="Primary">
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-projects"
						data-active={
							activeView === 'projects' ? 'true' : undefined
						}
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ () => onSelectView( 'projects' ) }
					>
						<FolderIcon />
						<span>Projects</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-tasks"
						data-active={
							activeView === 'tasks' ? 'true' : undefined
						}
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ () => onSelectView( 'tasks' ) }
					>
						<TasksIcon />
						<span>Tasks</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-drafts"
						data-active={
							activeView === 'drafts' ? 'true' : undefined
						}
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ () => onSelectView( 'drafts' ) }
					>
						<DraftsIcon />
						<span>Drafts</span>
					</button>
				</nav>
				<div
					className="sidebar-section sidebar-section-folders"
					data-testid="sidebar-recent"
				>
					<div className="sidebar-section-label">Recent</div>
					{ recentChats.length === 0 ? (
						<div
							className="sidebar-empty"
							data-testid="sidebar-recent-empty"
						>
							No recent chats.
						</div>
					) : (
						recentChats.map( ( entry ) => {
							const label =
								entry.chat.title?.trim() ||
								KIND_LABEL[ entry.chat.kind ];
							const isActive =
								entry.folderId === activeFolderId &&
								entry.chat.id === activeChatId &&
								activeView === 'chat';
							return (
								<button
									key={ entry.chat.id }
									type="button"
									className="sidebar-nav-item sidebar-recent-item"
									data-testid={ `sidebar-recent-${ entry.chat.id }` }
									data-active={
										isActive ? 'true' : undefined
									}
									tabIndex={ isOpen ? 0 : -1 }
									onClick={ () =>
										onSelectRecent(
											entry.folderId,
											entry.chat.id
										)
									}
									title={ `${ label } — ${ entry.folderName }` }
								>
									<FolderIcon />
									<span className="sidebar-recent-text">
										<span className="sidebar-recent-chat">
											{ label }
										</span>
										<span className="sidebar-recent-folder">
											{ entry.folderName }
										</span>
									</span>
								</button>
							);
						} )
					) }
				</div>
			</div>
		</aside>
	);
}
