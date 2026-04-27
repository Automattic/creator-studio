import React from 'react';

import { baseProps, type IconProps } from './types';

export function SidebarToggleIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<rect x="2.5" y="4" width="15" height="12" rx="2.25" />
			<path d="M7.75 4.25v11.5" />
		</svg>
	);
}
