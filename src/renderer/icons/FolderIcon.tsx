import React from 'react';

import { baseProps, type IconProps } from './types';

export function FolderIcon( {
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
			<path d="M2.5 6.25A1.75 1.75 0 0 1 4.25 4.5h3.1a1.75 1.75 0 0 1 1.24.51l1 1a1.75 1.75 0 0 0 1.24.51h4.92A1.75 1.75 0 0 1 17.5 8.27v6.48a1.75 1.75 0 0 1-1.75 1.75H4.25A1.75 1.75 0 0 1 2.5 14.75V6.25Z" />
		</svg>
	);
}
