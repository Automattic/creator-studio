import React from 'react';

import { SidebarToggleIcon } from '../icons';

type Props = {
	onToggle: () => void;
	tabbable: boolean;
	toggleLabel: string;
	testIdPrefix?: string;
};

export function TopActions( {
	onToggle,
	tabbable,
	toggleLabel,
	testIdPrefix = 'sidebar',
}: Props ): React.ReactElement {
	const tabIndex = tabbable ? 0 : -1;
	return (
		<div className="top-actions">
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
