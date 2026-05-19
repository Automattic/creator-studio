import React, { useMemo } from 'react';

import {
	FolderIcon,
	HomeIcon,
	SearchIcon,
	SettingsIcon,
	TasksIcon,
} from '../icons';
import { relativeDate } from '../lib/relativeDate';

import { TopActions } from './TopActions';

export type View =
	| 'home'
	| 'projects'
	| 'project'
	| 'drafts'
	| 'done'
	| 'draft-editor';

export type RecentDraft = {
	projectId: string;
	projectName: string;
	relPath: string;
	title: string;
	mtime: number;
};

type RecencyBucket = 'today' | 'yesterday' | 'week' | 'earlier';

const BUCKET_LABELS: Record< RecencyBucket, string > = {
	today: 'Today',
	yesterday: 'Yesterday',
	week: 'This week',
	earlier: 'Earlier',
};

const BUCKET_ORDER: ReadonlyArray< RecencyBucket > = [
	'today',
	'yesterday',
	'week',
	'earlier',
];

function isSameCalendarDay( a: Date, b: Date ): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function bucketOf( mtime: number, now: number ): RecencyBucket {
	const m = new Date( mtime );
	const n = new Date( now );
	if ( isSameCalendarDay( m, n ) ) {
		return 'today';
	}
	const yesterday = new Date( n );
	yesterday.setDate( n.getDate() - 1 );
	if ( isSameCalendarDay( m, yesterday ) ) {
		return 'yesterday';
	}
	if ( now - mtime < 7 * 24 * 60 * 60 * 1000 ) {
		return 'week';
	}
	return 'earlier';
}

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onSearch: () => void;
	onOpenSettings: () => void;
	projectCount: number;
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
	onSearch,
	onOpenSettings,
	projectCount,
	recents,
	activeProjectId,
	activeDraftRelPath,
	onSelectRecentDraft,
	onViewAllDrafts,
	activeView,
	onSelectView,
}: SidebarProps ): React.ReactElement {
	const now = Date.now();
	const groupedRecents = useMemo( () => {
		const buckets: Record< RecencyBucket, RecentDraft[] > = {
			today: [],
			yesterday: [],
			week: [],
			earlier: [],
		};
		for ( const entry of recents ) {
			buckets[ bucketOf( entry.mtime, now ) ].push( entry );
		}
		return BUCKET_ORDER.filter(
			( bucket ) => buckets[ bucket ].length > 0
		).map( ( bucket ) => ( {
			bucket,
			label: BUCKET_LABELS[ bucket ],
			drafts: buckets[ bucket ],
		} ) );
	}, [ recents, now ] );
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
						tabbable={ isOpen }
						toggleLabel="Hide sidebar"
					/>
				</div>
				<nav className="sidebar-nav" aria-label="Primary">
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-home"
						data-active={
							activeView === 'home' ? 'true' : undefined
						}
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ () => onSelectView( 'home' ) }
					>
						<HomeIcon />
						<span>Home</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-projects"
						data-active={
							activeView === 'projects' ? 'true' : undefined
						}
						disabled={ projectCount === 0 }
						aria-disabled={
							projectCount === 0 ? 'true' : undefined
						}
						// eslint-disable-next-line no-nested-ternary
						tabIndex={ projectCount === 0 ? -1 : isOpen ? 0 : -1 }
						title={
							projectCount === 0 ? 'No projects yet' : undefined
						}
						onClick={ () => {
							if ( projectCount > 0 ) {
								onSelectView( 'projects' );
							}
						} }
					>
						<FolderIcon />
						<span>Projects</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="sidebar-search"
						aria-label="Search"
						title="Search"
						tabIndex={ isOpen ? 0 : -1 }
						onClick={ onSearch }
					>
						<SearchIcon />
						<span>Search</span>
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
						<span>Recent</span>
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
								key={ `bucket:${ group.bucket }` }
								className="sidebar-recent-group"
								data-bucket={ group.bucket }
							>
								<div className="sidebar-recent-group-label">
									{ group.label }
								</div>
								{ group.drafts.map( ( entry ) => {
									const trimmed = entry.title.trim();
									const label = trimmed || 'Untitled';
									const isPlaceholder =
										trimmed.length === 0 ||
										trimmed === 'Untitled';
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
											title={ `${ label } — ${ entry.projectName } · ${ relativeTime }` }
										>
											<span
												className="sidebar-recent-dot"
												aria-hidden="true"
												title={ entry.projectName }
											/>
											<span
												className="sidebar-recent-title"
												data-placeholder={
													isPlaceholder
														? 'true'
														: undefined
												}
											>
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
