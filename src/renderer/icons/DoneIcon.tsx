import React from 'react';

import { baseProps, type IconProps } from './types';

export function DoneIcon( {
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
			<circle cx="10" cy="10" r="7.25" />
			<path d="m6.5 10 2.5 2.5 5-5" />
		</svg>
	);
}
