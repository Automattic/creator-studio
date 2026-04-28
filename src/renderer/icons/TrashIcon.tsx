import React from 'react';

import { baseProps, type IconProps } from './types';

export function TrashIcon( {
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
			<path d="M3.5 6h13" />
			<path d="M8 6V4.5A1 1 0 0 1 9 3.5h2a1 1 0 0 1 1 1V6" />
			<path d="M5 6.5v9a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-9" />
			<path d="M8.5 9.5v5M11.5 9.5v5" />
		</svg>
	);
}
