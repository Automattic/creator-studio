import React from 'react';

import {
	ChatIcon,
	PlusIcon,
	SettingsIcon,
	SidebarToggleIcon,
	SkillsIcon,
} from './icons';

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
};

export function Sidebar( {
	isOpen,
	onToggle,
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
						<button
							type="button"
							className="sidebar-icon-btn"
							data-testid="sidebar-add"
							aria-label="Add project"
							title="Add project"
							tabIndex={ isOpen ? 0 : -1 }
						>
							<PlusIcon />
						</button>
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
						data-testid="nav-chat"
						data-active="true"
						tabIndex={ isOpen ? 0 : -1 }
					>
						<ChatIcon />
						<span>Chat</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-settings"
						tabIndex={ isOpen ? 0 : -1 }
					>
						<SettingsIcon />
						<span>Settings</span>
					</button>
					<button
						type="button"
						className="sidebar-nav-item"
						data-testid="nav-skills"
						tabIndex={ isOpen ? 0 : -1 }
					>
						<SkillsIcon />
						<span>Skills</span>
					</button>
				</nav>
			</div>
		</aside>
	);
}
