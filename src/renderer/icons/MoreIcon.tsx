import React from 'react';

import { baseProps, type IconProps } from './types';

export function MoreIcon( {
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
			fill="currentColor"
			stroke="none"
		>
			<circle cx="10" cy="4.5" r="1.4" />
			<circle cx="10" cy="10" r="1.4" />
			<circle cx="10" cy="15.5" r="1.4" />
		</svg>
	);
}
