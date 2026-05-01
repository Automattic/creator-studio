import React, { useEffect, useRef } from 'react';

// TODO(ai-menu): wire actions to the Agent SDK in a follow-up PR.
// Everything here is intentionally non-functional in this PR — the menu is a
// visible placeholder that locks in the trigger keybinding (Cmd+J), the
// position next to the cursor, and the action surface so future work plumbs
// IPC and stream handling without redesigning the UI.

type Action = {
	id: string;
	icon: string;
	label: string;
};

const ACTIONS: Action[] = [
	{ id: 'check-grammar', icon: '✓', label: 'Check grammar' },
	{ id: 'rewrite-sharper', icon: '✎', label: 'Rewrite sharper' },
	{ id: 'expand-idea', icon: '⤢', label: 'Expand this idea' },
	{ id: 'brainstorm', icon: '✦', label: 'Brainstorm' },
	{ id: 'continue-writing', icon: '→', label: 'Continue writing' },
];

export type AiMenuPosition = { top: number; left: number };

type Props = {
	open: boolean;
	position: AiMenuPosition | null;
	onClose: () => void;
};

export function AiMenu( {
	open,
	position,
	onClose,
}: Props ): React.ReactElement | null {
	const menuRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onMouseDown = ( e: MouseEvent ): void => {
			if (
				menuRef.current &&
				! menuRef.current.contains( e.target as Node )
			) {
				onClose();
			}
		};
		const onResize = (): void => onClose();
		window.addEventListener( 'mousedown', onMouseDown );
		window.addEventListener( 'resize', onResize );
		return () => {
			window.removeEventListener( 'mousedown', onMouseDown );
			window.removeEventListener( 'resize', onResize );
		};
	}, [ open, onClose ] );

	if ( ! open || ! position ) {
		return null;
	}

	// Clamp into viewport so a menu opened near the right/bottom edge doesn't
	// sit half offscreen. The widths here are conservative — a precise fit
	// would need post-mount measurement.
	const menuWidth = 280;
	const menuHeight = 240;
	const left = Math.min(
		position.left,
		Math.max( 8, window.innerWidth - menuWidth - 8 )
	);
	const top = Math.min(
		position.top,
		Math.max( 8, window.innerHeight - menuHeight - 8 )
	);

	return (
		<div
			ref={ menuRef }
			className="ai-menu"
			data-testid="ai-menu"
			role="menu"
			style={ { top, left } }
		>
			<div className="ai-menu-input">
				<span className="ai-menu-glyph" aria-hidden="true">
					✦
				</span>
				<input
					type="text"
					className="ai-menu-input-field"
					data-testid="ai-menu-input"
					placeholder="Ask AI to edit or generate…"
					disabled
					aria-disabled="true"
				/>
			</div>
			<ul className="ai-menu-list">
				{ ACTIONS.map( ( a ) => (
					<li key={ a.id }>
						<button
							type="button"
							className="ai-menu-action"
							data-testid={ `ai-menu-action-${ a.id }` }
							disabled
							aria-disabled="true"
						>
							<span
								className="ai-menu-action-glyph"
								aria-hidden="true"
							>
								{ a.icon }
							</span>
							<span>{ a.label }</span>
						</button>
					</li>
				) ) }
			</ul>
		</div>
	);
}
