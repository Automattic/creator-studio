import React from 'react';

import { baseProps, type IconProps } from './types';

export function ArrowUpIcon( {
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
			<path d="M10 15.5v-11M5 9.5l5-5 5 5" />
		</svg>
	);
}
