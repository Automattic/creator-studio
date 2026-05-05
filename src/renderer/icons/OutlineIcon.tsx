import React from 'react';

import { baseProps, type IconProps } from './types';

export function OutlineIcon( {
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
			<path d="M7 9.5h9" />
			<path d="M4 14h12" />
			<path d="M7 18.5h0" />
		</svg>
	);
}
