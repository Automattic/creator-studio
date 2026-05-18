import React from 'react';

import { baseProps, type IconProps } from './types';

export function UploadIcon( {
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
			<path d="M10 13V3.5" />
			<path d="m6.5 7 3.5-3.5L13.5 7" />
			<path d="M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
		</svg>
	);
}
