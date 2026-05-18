import React from 'react';

import { baseProps, type IconProps } from './types';

export function SignOutIcon( {
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
			<path d="M11.5 4.5h-5a1.5 1.5 0 0 0-1.5 1.5v8a1.5 1.5 0 0 0 1.5 1.5h5" />
			<path d="M9 10h8.5" />
			<path d="M14 6.5 17.5 10 14 13.5" />
		</svg>
	);
}
