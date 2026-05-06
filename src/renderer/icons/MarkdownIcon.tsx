import React from 'react';

import { baseProps, type IconProps } from './types';

export function MarkdownIcon( {
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
			<rect x="2" y="5" width="16" height="10" rx="2" />
			<path d="M5.5 12.5v-5l2 2.5 2-2.5v5" />
			<path d="M13 7.5v5M11 11l2 2 2-2" />
		</svg>
	);
}
