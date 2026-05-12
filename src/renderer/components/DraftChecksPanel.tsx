import React, { useMemo, useState } from 'react';

import { DraftCheckIssue, DraftCheckKind } from '../../types';

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
	issues?: DraftCheckIssue[];
	activeIssueId?: string | null;
	running?: boolean;
	errorByKind?: Partial< Record< DraftCheckKind, string > >;
	onRun?: ( kinds: DraftCheckKind[] ) => void;
	onSelectIssue?: ( id: string ) => void;
	onApplyIssues?: ( ids: string[] ) => void;
	onDismissIssues?: ( ids: string[] ) => void;
};

export function DraftChecksPanel( {
	issues = [],
	activeIssueId = null,
	running = false,
	errorByKind = {},
	onRun,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
}: Props ): React.ReactElement {
	const [ selected, setSelected ] = useState< Set< DraftCheckKind > >(
		() => new Set( ALL_KINDS )
	);

	const groupedIssues = useMemo( () => {
		const groups = new Map< DraftCheckKind, DraftCheckIssue[] >();
		for ( const kind of ALL_KINDS ) {
			groups.set( kind, [] );
		}
		for ( const issue of issues ) {
			groups.get( issue.kind )?.push( issue );
		}
		return groups;
	}, [ issues ] );

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
	const total = issues.length;
	const hasResults = total > 0;
	const allIds = useMemo( () => issues.map( ( i ) => i.id ), [ issues ] );

	return (
		<div className="draft-checks-panel" data-testid="draft-checks-panel">
			<section className="draft-checks-run-card">
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
							<li
								key={ kind }
								className="draft-checks-panel-item"
							>
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
										<span
											className="draft-checks-kind-dot"
											data-check-kind={ kind }
											aria-hidden="true"
										/>
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
				<button
					type="button"
					className="draft-checks-panel-run"
					data-testid="draft-checks-run"
					disabled={ ! canRun }
					onClick={ handleRun }
				>
					{ running ? 'Checking…' : 'Run checks' }
				</button>
			</section>
			{ hasResults && (
				<section
					className="draft-checks-summary-bar"
					data-testid="draft-checks-summary"
					data-running={ running ? 'true' : 'false' }
				>
					<span className="draft-checks-summary-count">
						{ total } { total === 1 ? 'issue' : 'issues' }
					</span>
					<div className="draft-checks-summary-actions">
						<button
							type="button"
							className="check-action-button check-action-button-ghost"
							data-testid="draft-checks-summary-dismiss-all"
							onClick={ () => onDismissIssues?.( allIds ) }
						>
							Dismiss all
						</button>
						<button
							type="button"
							className="check-action-button check-action-button-primary"
							data-testid="draft-checks-summary-apply-all"
							onClick={ () => onApplyIssues?.( allIds ) }
						>
							Apply all ({ total })
						</button>
					</div>
				</section>
			) }
			{ hasResults && (
				<div
					className="draft-checks-results"
					data-testid="draft-checks-results"
					data-running={ running ? 'true' : 'false' }
				>
					{ ALL_KINDS.map( ( kind ) => {
						const list = groupedIssues.get( kind ) ?? [];
						const err = errorByKind[ kind ];
						if ( list.length === 0 && ! err ) {
							return null;
						}
						const groupIds = list.map( ( i ) => i.id );
						return (
							<section
								key={ kind }
								className="draft-checks-results-group"
								data-check-kind={ kind }
							>
								<header className="draft-checks-results-title">
									<span
										className="draft-checks-kind-dot"
										data-check-kind={ kind }
										aria-hidden="true"
									/>
									<span className="draft-checks-results-title-label">
										{ CHECK_LABELS[ kind ] }
									</span>
									{ list.length > 0 && (
										<span className="draft-checks-results-count">
											{ list.length }
										</span>
									) }
									{ list.length >= 2 && (
										<button
											type="button"
											className="check-action-button check-action-button-ghost draft-checks-group-apply-all"
											data-testid={ `draft-checks-group-apply-all-${ kind }` }
											onClick={ () =>
												onApplyIssues?.( groupIds )
											}
										>
											Apply all
										</button>
									) }
								</header>
								{ err && (
									<p
										className="draft-checks-results-error"
										data-testid={ `draft-checks-error-${ kind }` }
									>
										{ err }
									</p>
								) }
								<ul className="draft-checks-results-list">
									{ list.map( ( issue ) => (
										<li
											key={ issue.id }
											className="draft-checks-result"
											data-testid={ `draft-checks-result-${ issue.id }` }
											data-active={
												activeIssueId === issue.id
													? 'true'
													: 'false'
											}
										>
											<button
												type="button"
												className="draft-checks-result-body"
												onClick={ () =>
													onSelectIssue?.( issue.id )
												}
											>
												<span className="draft-checks-result-message">
													{ issue.message }
												</span>
												<span className="draft-checks-result-change">
													<span className="draft-checks-result-original">
														{ issue.original }
													</span>
													<span
														className="draft-checks-result-arrow"
														aria-hidden="true"
													>
														→
													</span>
													<span className="draft-checks-result-replacement">
														{ issue.replacement }
													</span>
												</span>
											</button>
											<div className="draft-checks-result-actions">
												<button
													type="button"
													className="check-action-button check-action-button-secondary"
													data-testid={ `draft-checks-result-dismiss-${ issue.id }` }
													onClick={ () =>
														onDismissIssues?.( [
															issue.id,
														] )
													}
												>
													Dismiss
												</button>
												<button
													type="button"
													className="check-action-button check-action-button-primary"
													data-testid={ `draft-checks-result-apply-${ issue.id }` }
													onClick={ () =>
														onApplyIssues?.( [
															issue.id,
														] )
													}
												>
													Apply
												</button>
											</div>
										</li>
									) ) }
								</ul>
							</section>
						);
					} ) }
				</div>
			) }
		</div>
	);
}
