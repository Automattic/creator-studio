import React from 'react';

import { baseProps, type IconProps } from './types';

export function ChatIcon( {
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
			<path d="M3.5 6.5a2.5 2.5 0 0 1 2.5-2.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8.5l-3 2.5v-2.5H6a2.5 2.5 0 0 1-2.5-2.5v-5Z" />
		</svg>
	);
}
