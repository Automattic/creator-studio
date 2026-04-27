import React from 'react';

import { baseProps, type IconProps } from './types';

export function PlusIcon( {
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
			<path d="M10 4.5v11M4.5 10h11" />
		</svg>
	);
}
