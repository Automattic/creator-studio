import React from 'react';

import { baseProps, type IconProps } from './types';

export function PublishedIcon( {
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
			<circle cx="10" cy="10" r="6.75" />
			<ellipse cx="10" cy="10" rx="3" ry="6.75" />
			<path d="M3.25 10h13.5" />
		</svg>
	);
}
