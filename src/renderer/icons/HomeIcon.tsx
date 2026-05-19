import React from 'react';

import { baseProps, type IconProps } from './types';

export function HomeIcon( {
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
			<path d="M3 8.5L10 3l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5z" />
			<polyline points="7.5 17 7.5 11.5 12.5 11.5 12.5 17" />
		</svg>
	);
}
