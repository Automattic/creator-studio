import React from 'react';

import { baseProps, type IconProps } from './types';

export function FilePlusIcon( {
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
			<path d="M5 3h7l3 3v11H5V3Z" />
			<path d="M12 3v3h3" />
		</svg>
	);
}
