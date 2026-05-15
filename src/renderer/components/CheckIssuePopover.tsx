import React, { useEffect, useRef } from 'react';

import { checkColorStyle } from '../lib/checkColor';
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
			if ( ! ref.current || ! ( e.target instanceof Node ) ) {
				return;
			}
			if ( ref.current.contains( e.target ) ) {
				return;
			}
			// Clicks on a different highlight mark — or on a different
			// suggestion row in the sidebar — switch the popover via
			// the originating mousedown/click handler. Closing here would
			// wipe the new popover state from React's batch, leaving the
			// user with no popover and requiring a second click to reopen.
			const target =
				e.target instanceof Element ? e.target : e.target.parentElement;
			if (
				target?.closest( '.cm-check-issue' ) ||
				target?.closest( '.draft-checks-result' )
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

	const colorStyle = checkColorStyle( issue.checkRelPath );

	return (
		<div
			ref={ ref }
			className="check-issue-popover"
			data-testid="check-issue-popover"
			data-check-rel-path={ issue.checkRelPath }
			style={ {
				...colorStyle,
				top: position.top,
				left: position.left,
			} }
			role="dialog"
		>
			<header className="check-issue-popover-header">
				<span className="draft-checks-kind-dot" aria-hidden="true" />
				<span className="check-issue-popover-title">
					{ issue.checkTitle }
				</span>
			</header>
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
					className="check-action-button check-action-button-ghost"
					data-testid="check-issue-popover-dismiss"
					onMouseDown={ preserveFocus }
					onClick={ onDismiss }
				>
					Dismiss
				</button>
				<button
					type="button"
					className="check-action-button check-action-button-primary"
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
