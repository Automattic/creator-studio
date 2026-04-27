import React from 'react';

import { baseProps, type IconProps } from './types';

export function SearchIcon( {
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
			<circle cx="9" cy="9" r="5.25" />
			<path d="m13 13 3.5 3.5" />
		</svg>
	);
}
