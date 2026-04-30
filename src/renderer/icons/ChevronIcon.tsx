import React from 'react';

import { baseProps, type IconProps } from './types';

export function ChevronIcon( {
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
			<path d="M6 8l4 4 4-4" />
		</svg>
	);
}
