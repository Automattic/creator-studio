import React from 'react';

import type { LanguageAidResult } from '../../types';

export type LanguageAidPopoverState =
	| { kind: 'loading'; word: string }
	| { kind: 'ready'; word: string; result: LanguageAidResult }
	| { kind: 'error'; word: string; message: string };

type Props = {
	state: LanguageAidPopoverState;
	// Replace the hovered word in place with a synonym.
	onApplySynonym?: ( synonym: string ) => void;
	// Replace the whole enclosing sentence with a rewrite.
	onApplyRewrite?: ( rewrite: string ) => void;
};

function resolveDataState( state: LanguageAidPopoverState ): string {
	if ( state.kind !== 'ready' ) {
		return state.kind;
	}
	return state.result.error ? 'error' : 'ready';
}

export function LanguageAidPopover( {
	state,
	onApplySynonym,
	onApplyRewrite,
}: Props ): React.ReactElement {
	const dataState = resolveDataState( state );
	// Don't let a mousedown inside the popover steal the editor selection
	// before the click handler runs the replacement.
	const preserveFocus = ( e: React.MouseEvent ): void => {
		e.preventDefault();
	};
	const ready = state.kind === 'ready' ? state.result : null;
	return (
		<div
			className="language-aid-popover"
			data-testid="language-aid-popover"
			data-state={ dataState }
			role="dialog"
			aria-live="polite"
		>
			<header className="language-aid-popover-header">
				<span className="language-aid-popover-word">
					{ state.word }
				</span>
				{ ready && ! ready.error && ready.partOfSpeech && (
					<span className="language-aid-popover-pos">
						{ ready.partOfSpeech }
					</span>
				) }
			</header>
			{ state.kind === 'loading' && (
				<div
					className="language-aid-popover-loading"
					aria-label="Looking up word"
				>
					<span
						className="language-aid-popover-spinner"
						aria-hidden="true"
					/>
					<span>Looking up…</span>
				</div>
			) }
			{ state.kind === 'error' && (
				<p className="language-aid-popover-error">{ state.message }</p>
			) }
			{ ready && ready.error && (
				<p className="language-aid-popover-error">{ ready.error }</p>
			) }
			{ ready && ! ready.error && (
				<>
					{ ready.definition && (
						<div className="language-aid-popover-section">
							<div className="language-aid-popover-label">
								Definition
							</div>
							<p className="language-aid-popover-definition">
								{ ready.definition }
							</p>
						</div>
					) }
					<div className="language-aid-popover-section">
						<div className="language-aid-popover-label">
							In this sentence
						</div>
						<p className="language-aid-popover-explanation">
							{ ready.explanation }
						</p>
					</div>
					{ ready.synonyms.length > 0 && (
						<div className="language-aid-popover-section">
							<div className="language-aid-popover-label">
								Synonyms you could use
							</div>
							<div
								className="language-aid-popover-synonyms"
								data-testid="language-aid-popover-synonyms"
							>
								{ ready.synonyms.map( ( syn ) => (
									<button
										key={ syn }
										type="button"
										className="language-aid-popover-synonym"
										onMouseDown={ preserveFocus }
										onClick={ () =>
											onApplySynonym?.( syn )
										}
									>
										{ syn }
									</button>
								) ) }
							</div>
						</div>
					) }
					{ ready.rewrites.length > 0 && (
						<div className="language-aid-popover-section">
							<div className="language-aid-popover-label">
								Rewrite
							</div>
							<div
								className="language-aid-popover-rewrites"
								data-testid="language-aid-popover-rewrites"
							>
								{ ready.rewrites.map( ( rw, i ) => (
									<div
										key={ i }
										className="language-aid-popover-rewrite"
									>
										<p className="language-aid-popover-rewrite-text">
											{ rw }
										</p>
										<button
											type="button"
											className="check-action-button check-action-button-primary"
											onMouseDown={ preserveFocus }
											onClick={ () =>
												onApplyRewrite?.( rw )
											}
										>
											Apply
										</button>
									</div>
								) ) }
							</div>
						</div>
					) }
					{ ready.issue && (
						<div
							className="language-aid-popover-issue"
							data-testid="language-aid-popover-issue"
						>
							<span
								className="language-aid-popover-flag"
								aria-label="Possible mistake"
							>
								⚑
							</span>
							<span>{ ready.issue }</span>
						</div>
					) }
					{ ready.suggestion && (
						<div
							className="language-aid-popover-suggestion"
							data-testid="language-aid-popover-suggestion"
						>
							<span className="language-aid-popover-suggestion-label">
								Try:
							</span>
							<span className="language-aid-popover-suggestion-text">
								{ ready.suggestion }
							</span>
						</div>
					) }
				</>
			) }
		</div>
	);
}
