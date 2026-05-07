import React from 'react';

import { DraftsIcon, FolderIcon, SettingsIcon, TasksIcon } from '../icons';

import { TopActions } from './TopActions';

export type View = 'projects' | 'project' | 'drafts' | 'done' | 'draft-editor';

export type RecentDraft = {
	projectId: string;
	projectName: string;
	relPath: string;
	title: string;
	mtime: number;
};

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkProject: () => void;
	onSearch: () => void;
	onOpenSettings: () => void;
	recents: RecentDraft[];
	activeProjectId: string | null;
	activeDraftRelPath: string | null;
	onSelectRecentDraft: (
		projectId: string,
		relPath: string,
		title: string
	) => void;
	onViewAllDrafts: () => void;
	activeView: View;
	onSelectView: ( view: View ) => void;
};

export function Sidebar( {
	isOpen,
	onToggle,
	onLinkProject,
	onSearch,
	onOpenSettings,
	recents,
	activeProjectId,
	activeDraftRelPath,
	onSelectRecentDraft,
	onViewAllDrafts,
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
				</nav>
				<div
					className="sidebar-section sidebar-section-projects"
					data-testid="sidebar-recent"
				>
					<div className="sidebar-section-label">
						<span>Recent Drafts</span>
						<button
							type="button"
							className="sidebar-section-view-all"
							data-testid="sidebar-recent-view-all"
							tabIndex={ isOpen ? 0 : -1 }
							onClick={ onViewAllDrafts }
						>
							View all
						</button>
					</div>
					{ recents.length === 0 ? (
						<div
							className="sidebar-empty"
							data-testid="sidebar-recent-empty"
						>
							No recent activity.
						</div>
					) : (
						recents.map( ( entry ) => {
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
				<div className="sidebar-bottom" data-testid="sidebar-bottom">
					<button
						type="button"
						className="sidebar-nav-item sidebar-settings-button"
						data-testid="sidebar-settings"
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ onOpenSettings }
						title="Settings"
					>
						<SettingsIcon />
						<span>Settings</span>
					</button>
				</div>
			</div>
		</aside>
	);
}
