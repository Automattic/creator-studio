import React, { useState } from 'react';

import { DraftCheckKind } from '../../types';

const CHECK_LABELS: Record< DraftCheckKind, string > = {
	'grammar-spelling': 'Grammar & spelling',
	brevity: 'Brevity',
	'passive-voice': 'Passive voice',
};

const CHECK_DESCRIPTIONS: Record< DraftCheckKind, string > = {
	'grammar-spelling': 'Fix spelling and grammar errors.',
	brevity: 'Omit needless words.',
	'passive-voice': 'Convert passive voice to active voice.',
};

const ALL_KINDS = DraftCheckKind.options;

type Props = {
	running?: boolean;
	onRun?: ( kinds: DraftCheckKind[] ) => void;
};

export function DraftChecksPanel( {
	running = false,
	onRun,
}: Props ): React.ReactElement {
	const [ selected, setSelected ] = useState< Set< DraftCheckKind > >(
		() => new Set( ALL_KINDS )
	);

	const toggle = ( kind: DraftCheckKind ): void => {
		setSelected( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( kind ) ) {
				next.delete( kind );
			} else {
				next.add( kind );
			}
			return next;
		} );
	};

	const handleRun = (): void => {
		if ( selected.size === 0 ) {
			return;
		}
		onRun?.( ALL_KINDS.filter( ( k ) => selected.has( k ) ) );
	};

	const canRun = selected.size > 0 && ! running;

	return (
		<div className="draft-checks-panel" data-testid="draft-checks-panel">
			<div
				className="draft-checks-panel-header"
				data-testid="draft-checks-panel-header"
			>
				Choose checks to run
			</div>
			<ul className="draft-checks-panel-list">
				{ ALL_KINDS.map( ( kind ) => {
					const inputId = `draft-checks-toggle-${ kind }`;
					return (
						<li key={ kind } className="draft-checks-panel-item">
							<input
								id={ inputId }
								type="checkbox"
								data-testid={ inputId }
								className="draft-checks-panel-checkbox"
								checked={ selected.has( kind ) }
								disabled={ running }
								onChange={ () => toggle( kind ) }
							/>
							<label
								className="draft-checks-panel-label"
								htmlFor={ inputId }
							>
								<span className="draft-checks-panel-label-title">
									{ CHECK_LABELS[ kind ] }
								</span>
								<span className="draft-checks-panel-label-desc">
									{ CHECK_DESCRIPTIONS[ kind ] }
								</span>
							</label>
						</li>
					);
				} ) }
			</ul>
			<div className="draft-checks-panel-actions">
				<button
					type="button"
					className="draft-checks-panel-run"
					data-testid="draft-checks-run"
					disabled={ ! canRun }
					onClick={ handleRun }
				>
					{ running ? 'Checking…' : 'Run checks' }
				</button>
			</div>
		</div>
	);
}
