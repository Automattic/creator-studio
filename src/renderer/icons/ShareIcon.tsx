import React from 'react';

import { baseProps, type IconProps } from './types';

export function ShareIcon( {
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
			<path d="M4 12.5v2A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2" />
			<path d="M10 12.5v-9M7 6.5l3-3 3 3" />
		</svg>
	);
}
