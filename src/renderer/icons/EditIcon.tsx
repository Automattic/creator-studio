import React from 'react';

import { baseProps, type IconProps } from './types';

export function EditIcon( {
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
			<path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
			<path d="M11.5 5.5l3 3" />
		</svg>
	);
}
