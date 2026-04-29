import React from 'react';

import { DraftsIcon, FolderIcon, PublishedIcon, TasksIcon } from '../icons';

import type { RecentChat } from '../../types';

import { TopActions } from './TopActions';

export type View = 'projects' | 'project';

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkProject: () => void;
	onSearch: () => void;
	recentChats: RecentChat[];
	activeProjectId: string | null;
	activeChatId: string | null;
	onSelectRecent: ( projectId: string, chatId: string ) => void;
	activeView: View;
	onSelectView: ( view: View ) => void;
};

export function Sidebar( {
	isOpen,
	onToggle,
	onLinkProject,
	onSearch,
	recentChats,
	activeProjectId,
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
						onLinkProject={ onLinkProject }
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
					className="sidebar-section sidebar-section-projects"
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
								entry.chat.title?.trim() || 'Untitled';
							const isActive =
								entry.projectId === activeProjectId &&
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
											entry.projectId,
											entry.chat.id
										)
									}
									title={ `${ label } — ${ entry.projectName }` }
								>
									<FolderIcon />
									<span className="sidebar-recent-text">
										<span className="sidebar-recent-chat">
											{ label }
										</span>
										<span className="sidebar-recent-project">
											{ entry.projectName }
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
