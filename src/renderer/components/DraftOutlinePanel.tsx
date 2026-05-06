import React from 'react';

import { activeHeadingIndex, type Heading } from '../editor/markdown-outline';

type Props = {
	headings: Heading[];
	cursorLine: number;
	onJump: ( pos: number ) => void;
};

export function DraftOutlinePanel( {
	headings,
	cursorLine,
	onJump,
}: Props ): React.ReactElement {
	if ( headings.length === 0 ) {
		return (
			<div
				className="draft-sidebar-empty"
				data-testid="draft-outline-panel"
			>
				No headings yet.
			</div>
		);
	}
	const active = activeHeadingIndex( headings, cursorLine );
	return (
		<ul
			className="draft-outline-list"
			data-testid="draft-outline-panel"
			aria-label="Document outline"
		>
			{ headings.map( ( h, i ) => (
				<li key={ `${ h.line }-${ h.pos }` }>
					<button
						type="button"
						className="draft-outline-item"
						data-testid="draft-outline-item"
						data-level={ h.level }
						data-active={ i === active ? 'true' : 'false' }
						title={ h.text }
						onClick={ () => onJump( h.pos ) }
					>
						{ h.text || ' ' }
					</button>
				</li>
			) ) }
		</ul>
	);
}
