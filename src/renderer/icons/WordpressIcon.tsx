import React from 'react';

import { baseProps, type IconProps } from './types';

export function WordpressIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 24 24"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<circle cx="12" cy="12" r="9.5" />
			<path d="M3 12 9.5 21l2.5-7" />
			<path d="m9 5 6 16 4.5-9-2-4.5a3 3 0 0 0-2.5-1.5h-2A3 3 0 0 0 10 8.5" />
		</svg>
	);
}
