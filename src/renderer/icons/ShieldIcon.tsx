import React from 'react';

import { baseProps, type IconProps } from './types';

export function ShieldIcon( {
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
			<path d="M10 2.6 4.7 4.7v4.4c0 3.4 2.25 6.3 5.3 7.3 3.05-1 5.3-3.9 5.3-7.3V4.7L10 2.6Z" />
			<path d="m7.7 9.9 1.7 1.7 3.2-3.4" />
		</svg>
	);
}
