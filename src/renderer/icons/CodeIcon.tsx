import React from 'react';

import { baseProps, type IconProps } from './types';

export function CodeIcon( {
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
			<path d="M7.5 6 4 10l3.5 4" />
			<path d="M12.5 6 16 10l-3.5 4" />
		</svg>
	);
}
