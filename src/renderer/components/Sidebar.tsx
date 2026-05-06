import React from 'react';

import {
	ChatIcon,
	DraftsIcon,
	FolderIcon,
	PublishedIcon,
	TasksIcon,
} from '../icons';

import type { ChatMeta } from '../../types';

import { TopActions } from './TopActions';

export type View = 'projects' | 'project' | 'drafts' | 'draft-editor';

export type RecentItem =
	| {
			kind: 'chat';
			projectId: string;
			projectName: string;
			chat: ChatMeta;
			updatedAt: number;
	  }
	| {
			kind: 'draft';
			projectId: string;
			projectName: string;
			relPath: string;
			title: string;
			updatedAt: number;
	  };

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkProject: () => void;
	onSearch: () => void;
	recents: RecentItem[];
	activeProjectId: string | null;
	activeChatId: string | null;
	activeDraftRelPath: string | null;
	onSelectRecentChat: ( projectId: string, chatId: string ) => void;
	onSelectRecentDraft: (
		projectId: string,
		relPath: string,
		title: string
	) => void;
	activeView: View;
	onSelectView: ( view: View ) => void;
};

export function Sidebar( {
	isOpen,
	onToggle,
	onLinkProject,
	onSearch,
	recents,
	activeProjectId,
	activeChatId,
	activeDraftRelPath,
	onSelectRecentChat,
	onSelectRecentDraft,
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
						data-active={
							activeView === 'drafts' ? 'true' : undefined
						}
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ () => onSelectView( 'drafts' ) }
					>
						<DraftsIcon />
						<span>Drafts</span>
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
					{ recents.length === 0 ? (
						<div
							className="sidebar-empty"
							data-testid="sidebar-recent-empty"
						>
							No recent activity.
						</div>
					) : (
						recents.map( ( entry ) => {
							if ( entry.kind === 'chat' ) {
								const label =
									entry.chat.title?.trim() || 'Untitled';
								const isActive =
									entry.projectId === activeProjectId &&
									entry.chat.id === activeChatId &&
									activeView === 'project';
								return (
									<button
										key={ `chat:${ entry.chat.id }` }
										type="button"
										className="sidebar-nav-item sidebar-recent-item"
										data-testid={ `sidebar-recent-${ entry.chat.id }` }
										data-recent-kind="chat"
										data-active={
											isActive ? 'true' : undefined
										}
										tabIndex={ isOpen ? 0 : -1 }
										onClick={ () =>
											onSelectRecentChat(
												entry.projectId,
												entry.chat.id
											)
										}
										title={ `${ label } — ${ entry.projectName }` }
									>
										<ChatIcon />
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
							}
							const label = entry.title.trim() || 'Untitled';
							const isActive =
								entry.projectId === activeProjectId &&
								entry.relPath === activeDraftRelPath &&
								activeView === 'draft-editor';
							return (
								<button
									key={ `draft:${ entry.projectId }:${ entry.relPath }` }
									type="button"
									className="sidebar-nav-item sidebar-recent-item"
									data-testid={ `sidebar-recent-draft-${ entry.projectId }-${ entry.relPath }` }
									data-recent-kind="draft"
									data-active={
										isActive ? 'true' : undefined
									}
									tabIndex={ isOpen ? 0 : -1 }
									onClick={ () =>
										onSelectRecentDraft(
											entry.projectId,
											entry.relPath,
											entry.title
										)
									}
									title={ `${ label } — ${ entry.projectName }` }
								>
									<DraftsIcon />
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
