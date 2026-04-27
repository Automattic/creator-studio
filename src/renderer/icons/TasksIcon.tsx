import React from 'react';

import { baseProps, type IconProps } from './types';

export function TasksIcon( {
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
			<rect x="3" y="3" width="14" height="14" rx="3" />
			<path d="m6.5 10 2.5 2.5L14 7.5" />
		</svg>
	);
}
