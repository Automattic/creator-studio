import React from 'react';

import { baseProps, type IconProps } from './types';

export function ChecksIcon( {
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
			<path d="m3 6 2 2 3.5-3.5" />
			<path d="m3 13 2 2 3.5-3.5" />
			<path d="M11 6h6" />
			<path d="M11 13h6" />
		</svg>
	);
}
