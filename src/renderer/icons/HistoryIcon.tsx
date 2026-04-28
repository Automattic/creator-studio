import React from 'react';

import { baseProps, type IconProps } from './types';

export function HistoryIcon( {
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
			<path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" />
			<path d="M3.5 3.5v3h3" />
			<path d="M10 6.5V10l2.25 1.5" />
		</svg>
	);
}
