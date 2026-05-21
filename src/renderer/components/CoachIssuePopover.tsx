import React, { useEffect, useRef } from 'react';

import type { CoachIssue } from '../../types';

export type CoachIssuePopoverPosition = { top: number; left: number };

const CATEGORY_LABEL: Record< CoachIssue[ 'category' ], string > = {
	grammar: 'Grammar',
	clarity: 'Style',
	ai: 'AI tell',
	voice: 'Voice',
};

const APPLY_LABEL: Record< CoachIssue[ 'category' ], string > = {
	grammar: 'Apply fix',
	clarity: 'Apply fix',
	ai: 'Humanize',
	voice: 'Use my voice',
};

const WHY_LABEL: Record< CoachIssue[ 'category' ], string > = {
	grammar: 'Why',
	clarity: 'Why',
	ai: 'Why it reads as AI',
	voice: 'Why it is off your voice',
};

type Props = {
	issue: CoachIssue;
	position: CoachIssuePopoverPosition;
	onApply: () => void;
	onDismiss: () => void;
	onClose: () => void;
};

export function CoachIssuePopover( {
	issue,
	position,
	onApply,
	onDismiss,
	onClose,
}: Props ): React.ReactElement {
	const ref = useRef< HTMLDivElement | null >( null );

	// Same outside-click / Escape handling as CheckIssuePopover: defer the
	// mousedown listener one frame so the opening click doesn't close it,
	// and ignore clicks that land on another flag or panel row (those swap
	// the popover via their own handlers).
	useEffect( () => {
		const onDocMouseDown = ( e: MouseEvent ): void => {
			if ( ! ref.current || ! ( e.target instanceof Node ) ) {
				return;
			}
			if ( ref.current.contains( e.target ) ) {
				return;
			}
			const target =
				e.target instanceof Element ? e.target : e.target.parentElement;
			if (
				target?.closest( '.cm-coach-issue' ) ||
				target?.closest( '.coach-issue-row' )
			) {
				return;
			}
			onClose();
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				onClose();
			}
		};
		const raf = window.requestAnimationFrame( () => {
			document.addEventListener( 'mousedown', onDocMouseDown );
		} );
		document.addEventListener( 'keydown', onKey );
		return () => {
			window.cancelAnimationFrame( raf );
			document.removeEventListener( 'mousedown', onDocMouseDown );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ onClose ] );

	const preserveFocus = ( e: React.MouseEvent ): void => {
		e.preventDefault();
	};

	const applyLabel = APPLY_LABEL[ issue.category ];

	return (
		<div
			ref={ ref }
			className="coach-issue-popover"
			data-testid="coach-issue-popover"
			data-category={ issue.category }
			style={ { top: position.top, left: position.left } }
			role="dialog"
		>
			<header className="coach-issue-popover-header">
				<span className="coach-issue-popover-type">
					{ CATEGORY_LABEL[ issue.category ] }
					{ issue.label ? ` · ${ issue.label }` : '' }
				</span>
			</header>
			<div className="coach-issue-popover-fix">
				<span className="coach-issue-popover-was">
					{ issue.original }
				</span>
				<span className="coach-issue-popover-arrow" aria-hidden="true">
					→
				</span>
				<span className="coach-issue-popover-now">
					{ issue.replacement }
				</span>
			</div>
			<div className="coach-issue-popover-section">
				<div className="coach-issue-popover-label">
					{ WHY_LABEL[ issue.category ] }
				</div>
				<p className="coach-issue-popover-explanation">
					{ issue.explanation }
				</p>
			</div>
			{ issue.tip && (
				<div className="coach-issue-popover-tip">
					<span
						className="coach-issue-popover-tip-mark"
						aria-hidden="true"
					>
						💡
					</span>
					<span>{ issue.tip }</span>
				</div>
			) }
			<div className="coach-issue-popover-actions">
				<button
					type="button"
					className="check-action-button check-action-button-ghost"
					data-testid="coach-issue-popover-dismiss"
					onMouseDown={ preserveFocus }
					onClick={ onDismiss }
				>
					Ignore
				</button>
				<button
					type="button"
					className="check-action-button check-action-button-primary"
					data-testid="coach-issue-popover-apply"
					onMouseDown={ preserveFocus }
					onClick={ onApply }
				>
					{ applyLabel }
				</button>
			</div>
		</div>
	);
}
