import React from 'react';
import { Menu } from '@base-ui/react/menu';

import {
	FolderIcon,
	FolderPlusIcon,
	PlusIcon,
	SettingsIcon,
	SidebarToggleIcon,
	SkillsIcon,
} from './icons';

export type Folder = {
	id: string;
	label: string;
};

type SidebarProps = {
	isOpen: boolean;
	onToggle: () => void;
	onLinkFolder: () => void;
	folders: Folder[];
	activeFolderId: string | null;
	onSelectFolder: ( id: string ) => void;
};

export function Sidebar( {
	isOpen,
	onToggle,
	onLinkFolder,
	folders,
	activeFolderId,
	onSelectFolder,
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
				<div
					className="sidebar-section sidebar-section-folders"
					data-testid="sidebar-folders"
				>
					<div className="sidebar-section-label">Folders</div>
					{ folders.length === 0 ? (
						<div
							className="sidebar-empty"
							data-testid="sidebar-folders-empty"
						>
							No folders yet.
						</div>
					) : (
						folders.map( ( folder ) => (
							<button
								key={ folder.id }
								type="button"
								className="sidebar-nav-item"
								data-testid={ `sidebar-folder-${ folder.id }` }
								data-active={
									folder.id === activeFolderId
										? 'true'
										: undefined
								}
								tabIndex={ isOpen ? 0 : -1 }
								onClick={ () => onSelectFolder( folder.id ) }
								title={ folder.label }
							>
								<FolderIcon />
								<span className="sidebar-nav-item-label">
									{ folder.label }
								</span>
							</button>
						) )
					) }
				</div>
				<nav
					className="sidebar-nav sidebar-nav-bottom"
					aria-label="App"
				>
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
