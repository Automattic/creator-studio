import React from 'react';

import { baseProps, type IconProps } from './types';

export function SettingsIcon( {
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
			<circle cx="10" cy="10" r="2.5" />
			<path d="M10 1.75v2.5M10 15.75v2.5M3.17 3.17l1.77 1.77M15.06 15.06l1.77 1.77M1.75 10h2.5M15.75 10h2.5M3.17 16.83l1.77-1.77M15.06 4.94l1.77-1.77" />
		</svg>
	);
}
