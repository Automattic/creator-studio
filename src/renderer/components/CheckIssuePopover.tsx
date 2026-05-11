import React, { useEffect, useRef } from 'react';

import type { DraftCheckIssue } from '../../types';

export type CheckIssuePopoverPosition = { top: number; left: number };

type Props = {
	issue: DraftCheckIssue;
	position: CheckIssuePopoverPosition;
	onApply: () => void;
	onDismiss: () => void;
	onClose: () => void;
};

export function CheckIssuePopover( {
	issue,
	position,
	onApply,
	onDismiss,
	onClose,
}: Props ): React.ReactElement {
	const ref = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		const onDocMouseDown = ( e: MouseEvent ): void => {
			if (
				ref.current &&
				e.target instanceof Node &&
				! ref.current.contains( e.target )
			) {
				onClose();
			}
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				onClose();
			}
		};
		// Defer the mousedown listener by one frame so the click that
		// opened the popover doesn't immediately close it. Keydown can
		// attach synchronously — Escape can't fire from the opening click.
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

	return (
		<div
			ref={ ref }
			className={ `check-issue-popover check-issue-popover-${ issue.kind }` }
			data-testid="check-issue-popover"
			data-check-kind={ issue.kind }
			style={ { top: position.top, left: position.left } }
			role="dialog"
		>
			<p className="check-issue-popover-message">{ issue.message }</p>
			<div className="check-issue-popover-change">
				<span className="check-issue-popover-original">
					{ issue.original }
				</span>
				<span className="check-issue-popover-arrow" aria-hidden="true">
					→
				</span>
				<span className="check-issue-popover-replacement">
					{ issue.replacement }
				</span>
			</div>
			<div className="check-issue-popover-actions">
				<button
					type="button"
					className="check-issue-popover-action check-issue-popover-action-secondary"
					data-testid="check-issue-popover-dismiss"
					onMouseDown={ preserveFocus }
					onClick={ onDismiss }
				>
					Dismiss
				</button>
				<button
					type="button"
					className="check-issue-popover-action check-issue-popover-action-primary"
					data-testid="check-issue-popover-apply"
					onMouseDown={ preserveFocus }
					onClick={ onApply }
				>
					Apply
				</button>
			</div>
		</div>
	);
}
