import React from 'react';

import { baseProps, type IconProps } from './types';

// A speech-bubble with a small spark — "guidance on your words".
export function CoachIcon( {
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
			<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h8A1.5 1.5 0 0 1 14 5.5v5A1.5 1.5 0 0 1 12.5 12H7l-3 3v-3H4.5A1.5 1.5 0 0 1 3 10.5z" />
			<path d="M16 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L14 6l1.4-.6z" />
		</svg>
	);
}
