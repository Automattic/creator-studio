import React from 'react';

import { baseProps, type IconProps } from './types';

// Stroke-only WordPress-style mark: a circle with a stylised "W"
// inside. Matches the rest of the icon set (no fills, 1.5 stroke,
// currentColor) rather than reusing the official solid logo.
export function WordpressIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 24 24"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<circle cx="12" cy="12" r="9.5" />
			<path d="M6 8.5 9 16 12 8.5 15 16 18 8.5" />
		</svg>
	);
}
