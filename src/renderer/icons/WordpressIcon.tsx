import React from 'react';

import { type IconProps } from './types';

// Official-style WordPress mark, drawn as a single filled path so it
// reads cleanly at 16–18px. The rest of the icon set is stroke-only,
// but a brand mark needs to look like the brand — stroke-only "W in
// a circle" attempts looked broken at this size.
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
			fill="currentColor"
		>
			<path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zM3.451 12c0-1.239.267-2.413.737-3.479l4.061 11.123A8.583 8.583 0 0 1 3.451 12zM12 20.549c-.84 0-1.652-.121-2.418-.348l2.567-7.461 2.633 7.214a.825.825 0 0 0 .062.121 8.521 8.521 0 0 1-2.844.474zm1.179-12.572c.515-.028.978-.083.978-.083.46-.055.406-.731-.055-.704 0 0-1.385.109-2.281.109-.84 0-2.255-.109-2.255-.109-.461-.027-.515.677-.054.704 0 0 .433.055.895.083l1.327 3.638-1.864 5.591-3.103-9.229c.516-.028.979-.083.979-.083.461-.054.406-.731-.055-.704 0 0-1.385.109-2.281.109-.161 0-.351-.005-.553-.011A8.55 8.55 0 0 1 12 3.451c2.236 0 4.273.855 5.802 2.255-.037-.002-.073-.007-.112-.007-.84 0-1.435.731-1.435 1.516 0 .704.406 1.3.84 2.005.325.569.704 1.3.704 2.355 0 .731-.281 1.58-.65 2.762l-.853 2.847-3.117-9.207zm3.083 11.443 2.605-7.531c.487-1.218.65-2.193.65-3.06 0-.314-.021-.605-.057-.879.665 1.211 1.043 2.602 1.043 4.082A8.539 8.539 0 0 1 16.262 19.42z" />
		</svg>
	);
}
