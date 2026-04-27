import React from 'react';
import { Menu } from '@base-ui/react/menu';

import {
	FolderPlusIcon,
	PlusIcon,
	SearchIcon,
	SidebarToggleIcon,
} from '../icons';

type Props = {
	onToggle: () => void;
	onLinkProject: () => void;
	onSearch: () => void;
	tabbable: boolean;
	toggleLabel: string;
	testIdPrefix?: string;
};

export function TopActions( {
	onToggle,
	onLinkProject,
	onSearch,
	tabbable,
	toggleLabel,
	testIdPrefix = 'sidebar',
}: Props ): React.ReactElement {
	const tabIndex = tabbable ? 0 : -1;
	return (
		<div className="top-actions">
			<Menu.Root>
				<Menu.Trigger
					className="sidebar-icon-btn"
					data-testid={ `${ testIdPrefix }-add` }
					aria-label="Add"
					title="Add"
					tabIndex={ tabIndex }
				>
					<PlusIcon />
				</Menu.Trigger>
				<Menu.Portal>
					<Menu.Positioner side="bottom" align="end" sideOffset={ 6 }>
						<Menu.Popup
							className="menu-popup"
							data-testid={ `${ testIdPrefix }-add-menu` }
						>
							<Menu.Item
								className="menu-item"
								data-testid={ `${ testIdPrefix }-add-menu-link-project` }
								onClick={ onLinkProject }
							>
								<FolderPlusIcon />
								<span>Link project</span>
							</Menu.Item>
						</Menu.Popup>
					</Menu.Positioner>
				</Menu.Portal>
			</Menu.Root>
			<button
				type="button"
				className="sidebar-icon-btn"
				data-testid={ `${ testIdPrefix }-search` }
				aria-label="Search"
				title="Search"
				onClick={ onSearch }
				tabIndex={ tabIndex }
			>
				<SearchIcon />
			</button>
			<button
				type="button"
				className="sidebar-icon-btn"
				data-testid={ `${ testIdPrefix }-toggle` }
				aria-label={ toggleLabel }
				title={ toggleLabel }
				onClick={ onToggle }
				tabIndex={ tabIndex }
			>
				<SidebarToggleIcon />
			</button>
		</div>
	);
}
