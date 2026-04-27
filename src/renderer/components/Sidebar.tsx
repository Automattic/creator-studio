import React from 'react';

import { DraftsIcon, FolderIcon, PublishedIcon, TasksIcon } from '../icons';

import type { ChatKind, RecentChat } from '../../types';

import { TopActions } from './TopActions';

export type View = 'projects' | 'project';

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkFolder: () => void;
	onSearch: () => void;
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
	onSearch,
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
					<TopActions
						onToggle={ onToggle }
						onLinkFolder={ onLinkFolder }
						onSearch={ onSearch }
						tabbable={ isOpen }
						toggleLabel="Hide sidebar"
					/>
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
						disabled
						aria-disabled="true"
						title="Tasks — coming soon"
						tabIndex={ -1 }
					>
						<TasksIcon />
						<span>Tasks</span>
						<span className="sidebar-nav-item-hint">Soon</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-drafts"
						disabled
						aria-disabled="true"
						title="Drafts — coming soon"
						tabIndex={ -1 }
					>
						<DraftsIcon />
						<span>Drafts</span>
						<span className="sidebar-nav-item-hint">Soon</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-published"
						disabled
						aria-disabled="true"
						title="Published — coming soon"
						tabIndex={ -1 }
					>
						<PublishedIcon />
						<span>Published</span>
						<span className="sidebar-nav-item-hint">Soon</span>
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
								activeView === 'project';
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
