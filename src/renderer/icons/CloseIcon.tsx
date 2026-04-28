import React from 'react';

import { baseProps, type IconProps } from './types';

export function CloseIcon( {
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
			<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
		</svg>
	);
}
