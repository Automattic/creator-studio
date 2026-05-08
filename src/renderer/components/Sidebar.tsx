import React, { useMemo } from 'react';

import { FolderIcon, SettingsIcon, TasksIcon } from '../icons';
import { relativeDate } from '../lib/relativeDate';

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
	const groupedRecents = useMemo( () => {
		const groups: Array< {
			projectId: string;
			projectName: string;
			drafts: RecentDraft[];
		} > = [];
		const indexByProject = new Map< string, number >();
		for ( const entry of recents ) {
			let i = indexByProject.get( entry.projectId );
			if ( i === undefined ) {
				i = groups.length;
				indexByProject.set( entry.projectId, i );
				groups.push( {
					projectId: entry.projectId,
					projectName: entry.projectName,
					drafts: [],
				} );
			}
			groups[ i ].drafts.push( entry );
		}
		return groups;
	}, [ recents ] );
	const now = Date.now();
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
					{ groupedRecents.length === 0 ? (
						<div
							className="sidebar-empty"
							data-testid="sidebar-recent-empty"
						>
							No recent activity.
						</div>
					) : (
						groupedRecents.map( ( group ) => (
							<div
								key={ `group:${ group.projectId }` }
								className="sidebar-recent-group"
							>
								<div
									className="sidebar-recent-group-label"
									title={ group.projectName }
								>
									{ group.projectName }
								</div>
								{ group.drafts.map( ( entry ) => {
									const label =
										entry.title.trim() || 'Untitled';
									const isActive =
										entry.projectId === activeProjectId &&
										entry.relPath === activeDraftRelPath &&
										activeView === 'draft-editor';
									const relativeTime = relativeDate(
										entry.mtime,
										now
									);
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
											<span className="sidebar-recent-title">
												{ label }
											</span>
											<span
												className="sidebar-recent-time"
												aria-hidden="true"
											>
												{ relativeTime }
											</span>
										</button>
									);
								} ) }
							</div>
						) )
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
