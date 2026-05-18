import React from 'react';

import { baseProps, type IconProps } from './types';

export function SparkleIcon( {
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
			<path d="M10 3 11.4 7.6 16 9l-4.6 1.4L10 15l-1.4-4.6L4 9l4.6-1.4L10 3Z" />
			<path d="M15.5 13.5 16 15l1.5.5L16 16l-.5 1.5L15 16l-1.5-.5L15 15l.5-1.5Z" />
		</svg>
	);
}
