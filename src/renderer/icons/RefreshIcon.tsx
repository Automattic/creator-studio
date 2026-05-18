import React from 'react';

import { baseProps, type IconProps } from './types';

export function RefreshIcon( {
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
			<path d="M16.5 6.5a7 7 0 0 0-12.5 1.5" />
			<path d="M16.5 3.5v3h-3" />
			<path d="M3.5 13.5a7 7 0 0 0 12.5-1.5" />
			<path d="M3.5 16.5v-3h3" />
		</svg>
	);
}
