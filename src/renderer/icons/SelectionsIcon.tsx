import React from 'react';

import { baseProps, type IconProps } from './types';

// Block-quote glyph: a vertical bar on the left flanked by three short
// horizontal lines, reading instantly as "excerpt of text". Replaces the
// </> placeholder we used while wiring the feature, which read as "code"
// and felt out of place in a writing tool.
export function SelectionsIcon( {
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
			<path d="M5 4.5v11" strokeWidth={ 2 } />
			<path d="M9 6.5h7" />
			<path d="M9 10h5" />
			<path d="M9 13.5h7" />
		</svg>
	);
}
