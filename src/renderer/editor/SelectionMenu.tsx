import React from 'react';

// Visual-only placeholder. Buttons are wired with `onMouseDown` +
// `preventDefault` so a future handler hookup doesn't need to redo the
// focus/selection-preservation dance — see FormattingToolbar's bindButton.

export type SelectionMenuPosition = { top: number; left: number };

type Props = {
	open: boolean;
	position: SelectionMenuPosition | null;
};

export function SelectionMenu( {
	open,
	position,
}: Props ): React.ReactElement | null {
	if ( ! open || ! position ) {
		return null;
	}

	const noop = ( e: React.MouseEvent ): void => {
		e.preventDefault();
	};

	return (
		<div
			className="selection-menu"
			data-testid="selection-menu"
			role="menu"
			style={ { top: position.top, left: position.left } }
		>
			<ul className="selection-menu-list">
				<li>
					<button
						type="button"
						className="selection-menu-action"
						data-testid="selection-menu-edit"
						onMouseDown={ noop }
					>
						<span
							className="selection-menu-action-glyph"
							aria-hidden="true"
						>
							<EditIcon />
						</span>
						<span>Edit</span>
					</button>
				</li>
				<li>
					<button
						type="button"
						className="selection-menu-action"
						data-testid="selection-menu-chat"
						onMouseDown={ noop }
					>
						<span
							className="selection-menu-action-glyph"
							aria-hidden="true"
						>
							<ChatIcon />
						</span>
						<span>Chat</span>
					</button>
				</li>
			</ul>
		</div>
	);
}

const ICON_PROPS = {
	width: 16,
	height: 16,
	viewBox: '0 0 20 20',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.5,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
	'aria-hidden': true,
};

function EditIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M14 3.5a1.77 1.77 0 0 1 2.5 2.5L7 15.5l-3.5 1 1-3.5Z" />
			<path d="m12.5 5 2.5 2.5" />
		</svg>
	);
}

function ChatIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M4 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
		</svg>
	);
}
