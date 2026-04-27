import React from 'react';

import { baseProps, type IconProps } from './types';

export function DraftsIcon( {
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
			<path d="m12.5 3.5 4 4L8 16H4v-4l8.5-8.5Z" />
			<path d="m11 5 4 4" />
		</svg>
	);
}
