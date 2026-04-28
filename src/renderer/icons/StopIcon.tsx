import React from 'react';

import { type IconProps } from './types';

export function StopIcon( {
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
			fill="currentColor"
		>
			<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
		</svg>
	);
}
