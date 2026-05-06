import React from 'react';

import { baseProps, type IconProps } from './types';

// Two equal side-by-side rounded panels. Used as the rail icon for the
// "Same project" sidebar tab — the split visually echoes "this draft + its
// peers in the same project".
export function SamePanelsIcon( {
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
			<rect x="2.5" y="4" width="6.5" height="12" rx="1.5" />
			<rect x="11" y="4" width="6.5" height="12" rx="1.5" />
		</svg>
	);
}
