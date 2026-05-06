import React from 'react';

import { baseProps, type IconProps } from './types';

export function SlidersIcon( {
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
			<path d="M4 5h12" />
			<path d="M4 10h12" />
			<path d="M4 15h12" />
			<circle cx="8" cy="5" r="1.6" />
			<circle cx="13" cy="10" r="1.6" />
			<circle cx="6" cy="15" r="1.6" />
		</svg>
	);
}
