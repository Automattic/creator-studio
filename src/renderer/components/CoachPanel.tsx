import React, { useMemo, useState } from 'react';

import { ChevronIcon } from '../icons';
import { headlineScore } from '../lib/headlineScore';
import { readability } from '../lib/readability';
import { wordDiff } from '../lib/wordDiff';
import type {
	CoachIssue,
	CoachIssueCategory,
	CoachRegister,
	CoachRewriteAction,
	CoachRewriteSuggestion,
	CoachScoreDimension,
	CoachStructureNote,
} from '../../types';

const SCORE_LABEL: Record< CoachScoreDimension[ 'key' ], string > = {
	clarity: 'Clarity',
	structure: 'Structure',
	engagement: 'Engagement',
	correctness: 'Correctness',
};

// Bucket the 1-5 AI-likeness rating for the meter's colour/intensity.
function aiLevel( n: number ): 'low' | 'medium' | 'high' {
	if ( n <= 2 ) {
		return 'low';
	}
	if ( n === 3 ) {
		return 'medium';
	}
	return 'high';
}

// Rewrite request lifecycle, owned by DraftEditorScreen and threaded down.
// `original` rides along on `ready` so the card can show a before→after diff.
export type CoachRewriteState =
	| { status: 'idle' }
	| { status: 'running'; action: CoachRewriteAction }
	| {
			status: 'ready';
			action: CoachRewriteAction;
			original: string;
			candidates: CoachRewriteSuggestion[];
	  }
	| { status: 'error'; action: CoachRewriteAction; message: string };

type Props = {
	// Review
	issues: CoachIssue[];
	// Draft text, for the locally-computed reading level in the summary strip.
	body: string;
	// Tonal register from the last scan; null until scanned.
	register: CoachRegister | null;
	visibleCategories: Record< CoachIssueCategory, boolean >;
	onToggleCategory: ( category: CoachIssueCategory ) => void;
	activeIssueId: string | null;
	reviewRunning: boolean;
	reviewError: string | null;
	hasReviewed: boolean;
	onReview: () => void;
	onSelectIssue: ( id: string ) => void;
	onApplyIssues: ( ids: string[] ) => void;
	onDismissIssues: ( ids: string[] ) => void;
	// Rubric scorecard — populated automatically by the review pass.
	scoreDimensions: CoachScoreDimension[];
	// Holistic AI-likeness (1-5, lower is better); null until reviewed.
	aiLikeness: number | null;
	// One-pass humanize: bulk-applies every AI-tell finding.
	onHumanizeAll: () => void;
	// Rewrite
	selectionLabel: string;
	hasSelection: boolean;
	rewrite: CoachRewriteState;
	onRewrite: ( action: CoachRewriteAction ) => void;
	onApplyCandidate: ( text: string ) => void;
	onClearRewrite: () => void;
	// My Voice: when a voice profile exists the button rewrites in-voice;
	// otherwise it launches the setup flow.
	voiceReady: boolean;
	onSetUpVoice: () => void;
	// Structure (opt-in, heavier pass)
	structureNotes: CoachStructureNote[];
	structureRunning: boolean;
	structureError: string | null;
	hasStructure: boolean;
	onReviewStructure: () => void;
	onSelectStructureNote: ( id: string ) => void;
};

const CATEGORIES: ReadonlyArray< {
	id: CoachIssueCategory;
	label: string;
} > = [
	{ id: 'grammar', label: 'Grammar' },
	// `clarity` is the internal key; the label widened to "Style" once the
	// scan started covering collocations, repetition, filler, and passive.
	{ id: 'clarity', label: 'Style' },
	{ id: 'ai', label: 'AI tells' },
	// Only shown once a voice profile exists (see voiceReady below).
	{ id: 'voice', label: 'Voice' },
];

const ACTIONS: ReadonlyArray< {
	id: CoachRewriteAction;
	icon: string;
	label: string;
	hint: string;
} > = [
	{
		id: 'beautify',
		icon: '🪶',
		label: 'Beautify',
		hint: 'Elevate the writing',
	},
	{ id: 'natural', icon: '✨', label: 'Natural', hint: 'Sound fluent' },
	{ id: 'fix', icon: '✓', label: 'Fix', hint: 'Grammar & spelling' },
	{ id: 'simpler', icon: '◎', label: 'Simpler', hint: 'Plainer and shorter' },
	{
		id: 'rephrase',
		icon: '⇄',
		label: 'Rephrase',
		hint: 'Say it differently',
	},
	{
		id: 'humanize',
		icon: '🤖',
		label: 'Humanize',
		hint: 'Strip the AI tells',
	},
];

export function CoachPanel( {
	issues,
	body,
	register,
	visibleCategories,
	onToggleCategory,
	activeIssueId,
	reviewRunning,
	reviewError,
	hasReviewed,
	onReview,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
	scoreDimensions,
	aiLikeness,
	onHumanizeAll,
	selectionLabel,
	hasSelection,
	rewrite,
	onRewrite,
	onApplyCandidate,
	onClearRewrite,
	voiceReady,
	onSetUpVoice,
	structureNotes,
	structureRunning,
	structureError,
	hasStructure,
	onReviewStructure,
	onSelectStructureNote,
}: Props ): React.ReactElement {
	// The dashboard headline = rounded mean of the rubric dimensions; the
	// per-dimension breakdown lives in a click-to-open popover so the always-on
	// strip stays compact.
	const [ scoreOpen, setScoreOpen ] = useState< boolean >( false );
	const headline = useMemo(
		() => headlineScore( scoreDimensions ),
		[ scoreDimensions ]
	);

	const counts = useMemo( () => {
		const c: Record< CoachIssueCategory, number > = {
			grammar: 0,
			clarity: 0,
			ai: 0,
			voice: 0,
		};
		for ( const issue of issues ) {
			c[ issue.category ] += 1;
		}
		return c;
	}, [ issues ] );

	const visibleIssues = useMemo(
		() => issues.filter( ( i ) => visibleCategories[ i.category ] ),
		[ issues, visibleCategories ]
	);

	const reading = useMemo( () => readability( body ), [ body ] );
	// One-line "how this reads": register (from the scan) + reading level
	// (local, live). Either half may be absent.
	const summary = useMemo( () => {
		const parts: string[] = [];
		if ( register ) {
			parts.push( `Reads ${ register }` );
		}
		if ( reading ) {
			parts.push( `grade ${ reading.grade }` );
		}
		return parts.join( ' · ' );
	}, [ register, reading ] );

	return (
		<div className="coach-panel" data-testid="draft-coach-panel">
			{ /* ---- Dashboard (pinned, auto) ---- */ }
			<div
				className="coach-dashboard"
				data-testid="draft-coach-dashboard"
			>
				<button
					type="button"
					className="coach-dashboard-score"
					data-testid="draft-coach-dashboard-score"
					data-open={ scoreOpen }
					disabled={ headline === null }
					aria-expanded={ scoreOpen }
					onClick={ () => setScoreOpen( ( v ) => ! v ) }
				>
					<span
						className="coach-dashboard-dots"
						aria-label={
							headline !== null
								? `Draft score ${ headline } of 5`
								: 'Not scored yet'
						}
					>
						{ headline !== null
							? '●'.repeat( headline ) +
							  '○'.repeat( 5 - headline )
							: '○○○○○' }
					</span>
					<span className="coach-dashboard-num">
						{ headline !== null ? `${ headline }/5` : '—' }
					</span>
					<ChevronIcon
						size={ 12 }
						className="coach-dashboard-caret"
					/>
				</button>
				{ summary && (
					<div
						className="coach-dashboard-summary"
						data-testid="draft-coach-summary"
					>
						{ summary }
					</div>
				) }
				{ aiLikeness !== null && (
					<div
						className="coach-ai-meter"
						data-testid="draft-coach-ai-meter"
						data-level={ aiLevel( aiLikeness ) }
					>
						<span className="coach-ai-meter-label">
							AI likeness
						</span>
						<span
							className="coach-ai-meter-bar"
							aria-label={ `AI likeness ${ aiLikeness } of 5, lower is better` }
						>
							{ '●'.repeat( aiLikeness ) }
							{ '○'.repeat( 5 - aiLikeness ) }
						</span>
						{ counts.ai > 0 && (
							<button
								type="button"
								className="coach-humanize-all"
								data-testid="draft-coach-humanize-all"
								onClick={ onHumanizeAll }
							>
								Humanize all { counts.ai }
							</button>
						) }
					</div>
				) }
				{ scoreOpen && scoreDimensions.length > 0 && (
					<ul
						className="coach-score-list"
						data-testid="draft-coach-score-popover"
					>
						{ scoreDimensions.map( ( d ) => (
							<li
								key={ d.key }
								className="coach-score-row"
								data-testid={ `draft-coach-score-${ d.key }` }
							>
								<span className="coach-score-key">
									{ SCORE_LABEL[ d.key ] }
								</span>
								<span
									className="coach-score-bar"
									aria-label={ `${ d.score } of 5` }
								>
									{ '●'.repeat( d.score ) }
									{ '○'.repeat( 5 - d.score ) }
								</span>
								<span className="coach-score-note">
									{ d.note }
								</span>
							</li>
						) ) }
					</ul>
				) }
			</div>

			{ /* ---- Findings ---- */ }
			<section className="coach-flow-section">
				<div className="coach-flow-head">
					<span className="coach-flow-title">Findings</span>
					<button
						type="button"
						className="coach-flow-rescan"
						data-testid="draft-coach-rescan"
						disabled={ reviewRunning }
						onClick={ () => onReview() }
					>
						{ reviewRunning ? 'Reviewing…' : 'Rescan' }
					</button>
				</div>
				<div className="coach-section-body">
					<div className="coach-review-head">
						{ CATEGORIES.filter(
							// The Voice lens only applies once a voice
							// profile exists.
							( cat ) => cat.id !== 'voice' || voiceReady
						).map( ( cat ) => (
							<button
								key={ cat.id }
								type="button"
								className={ `coach-cat-pill coach-cat-${
									cat.id
								} ${
									visibleCategories[ cat.id ] ? 'on' : 'off'
								}` }
								data-testid={ `draft-coach-cat-${ cat.id }` }
								onClick={ () => onToggleCategory( cat.id ) }
							>
								{ cat.label } { counts[ cat.id ] }
							</button>
						) ) }
					</div>
					{ reviewError && (
						<p
							className="coach-review-error"
							data-testid="draft-coach-review-error"
						>
							{ reviewError }
						</p>
					) }
					{ ! reviewError &&
						hasReviewed &&
						! reviewRunning &&
						issues.length === 0 && (
							<p className="coach-review-empty">
								Looks clean. 🎉
							</p>
						) }
					{ ! reviewError &&
						! hasReviewed &&
						! reviewRunning &&
						issues.length === 0 && (
							<p className="coach-review-empty">
								Reviewing finds grammar, style, and AI issues.
							</p>
						) }
					<ul className="coach-issue-list">
						{ visibleIssues.map( ( issue ) => (
							<li
								key={ issue.id }
								className="coach-issue-row"
								data-testid={ `draft-coach-issue-${ issue.id }` }
								data-active={
									activeIssueId === issue.id
										? 'true'
										: 'false'
								}
							>
								<button
									type="button"
									className="coach-issue-row-body"
									onClick={ () => onSelectIssue( issue.id ) }
								>
									<span
										className={ `coach-issue-bar coach-issue-bar-${ issue.category }` }
										aria-hidden="true"
									/>
									<span className="coach-issue-text">
										<span className="coach-issue-original">
											{ issue.original }
										</span>
										<span className="coach-issue-fix">
											{ issue.label } ·{ ' ' }
											{ issue.category === 'ai' ? (
												<i>sounds AI</i>
											) : (
												<>
													→{ ' ' }
													<b>{ issue.replacement }</b>
												</>
											) }
										</span>
									</span>
								</button>
								<div className="coach-issue-row-actions">
									<button
										type="button"
										className="check-action-button check-action-button-ghost"
										data-testid={ `draft-coach-issue-dismiss-${ issue.id }` }
										onClick={ () =>
											onDismissIssues( [ issue.id ] )
										}
									>
										Ignore
									</button>
									<button
										type="button"
										className="check-action-button check-action-button-primary"
										data-testid={ `draft-coach-issue-apply-${ issue.id }` }
										onClick={ () =>
											onApplyIssues( [ issue.id ] )
										}
									>
										Apply
									</button>
								</div>
							</li>
						) ) }
					</ul>
				</div>
			</section>

			{ /* ---- Rewrite (contextual) ---- */ }
			<section className="coach-flow-section">
				<div className="coach-flow-head">
					<span className="coach-flow-title">Rewrite</span>
					<span className="coach-flow-muted">selection</span>
				</div>
				<div className="coach-section-body">
					{ ! hasSelection && rewrite.status === 'idle' ? (
						<p
							className="coach-rewrite-idle"
							data-testid="draft-coach-rewrite-idle"
						>
							Place the cursor in a sentence, or select text, to
							rewrite it.
						</p>
					) : (
						<>
							<div className="coach-applying">
								Selection{ ' ' }
								<span className="coach-applying-fallback">
									or current sentence
								</span>
							</div>
							<div
								className="coach-applying-target"
								data-testid="draft-coach-rewrite-target"
							>
								{ selectionLabel
									? `“${ selectionLabel }”`
									: 'Place the cursor in a sentence, or select text.' }
							</div>
							<div className="coach-action-grid">
								{ ACTIONS.map( ( action ) => {
									const active =
										rewrite.status !== 'idle' &&
										rewrite.action === action.id;
									return (
										<button
											key={ action.id }
											type="button"
											className={ `coach-action${
												active
													? ' coach-action-active'
													: ''
											}` }
											data-testid={ `draft-coach-action-${ action.id }` }
											aria-pressed={ active }
											disabled={
												! hasSelection ||
												rewrite.status === 'running'
											}
											onClick={ () =>
												onRewrite( action.id )
											}
										>
											<span className="coach-action-ico">
												{ action.icon }
											</span>
											<span className="coach-action-text">
												{ action.label }
												<small>{ action.hint }</small>
											</span>
										</button>
									);
								} ) }
							</div>
							<button
								type="button"
								className={ `coach-myvoice${
									voiceReady &&
									rewrite.status !== 'idle' &&
									rewrite.action === 'myVoice'
										? ' coach-action-active'
										: ''
								}` }
								data-testid="draft-coach-myvoice"
								data-ready={ voiceReady }
								disabled={
									voiceReady &&
									( ! hasSelection ||
										rewrite.status === 'running' )
								}
								title={
									voiceReady
										? 'Rewrite the selection in your voice'
										: 'Set up your writing voice'
								}
								onClick={ () =>
									voiceReady
										? onRewrite( 'myVoice' )
										: onSetUpVoice()
								}
							>
								<span className="coach-myvoice-ico">⭐</span>
								<span className="coach-myvoice-label">
									My voice
									<small>
										{ voiceReady
											? 'Rewrite in your voice'
											: 'Match how you usually write' }
									</small>
								</span>
								{ ! voiceReady && (
									<span className="coach-myvoice-badge">
										Set up
									</span>
								) }
							</button>
							{ rewrite.status === 'running' && (
								<p className="coach-rewrite-status">
									Rewriting…
								</p>
							) }
							{ rewrite.status === 'error' && (
								<p
									className="coach-rewrite-status coach-rewrite-error"
									data-testid="draft-coach-rewrite-error"
								>
									{ rewrite.message }
								</p>
							) }
							{ rewrite.status === 'ready' && (
								<div
									className="coach-candidates"
									data-testid="draft-coach-candidates"
								>
									<div className="coach-candidates-head">
										{ rewrite.candidates.length > 1
											? 'Pick one'
											: 'Suggestion' }
										<button
											type="button"
											className="coach-candidates-clear"
											data-testid="draft-coach-candidates-clear"
											onClick={ onClearRewrite }
										>
											Cancel
										</button>
									</div>
									{ rewrite.candidates.map( ( cand, i ) => (
										<div
											key={ i }
											className="coach-candidate"
											data-testid={ `draft-coach-candidate-${ i }` }
										>
											{ rewrite.action === 'fix' ? (
												// Correctness: show exactly what
												// changed, as a diff.
												<p
													className="coach-candidate-text"
													data-testid={ `draft-coach-candidate-diff-${ i }` }
												>
													{ wordDiff(
														rewrite.original,
														cand.text
													).map( ( part, k ) => (
														<span
															key={ k }
															className={ `coach-diff-${ part.type }` }
														>
															{ part.text }
														</span>
													) ) }
												</p>
											) : (
												// Subjective: compare results, so
												// show clean text headed by its
												// differentiating "why".
												<>
													{ cand.why && (
														<p
															className="coach-candidate-why"
															data-testid={ `draft-coach-candidate-why-${ i }` }
														>
															{ cand.why }
														</p>
													) }
													<p
														className="coach-candidate-text coach-candidate-clean"
														data-testid={ `draft-coach-candidate-text-${ i }` }
													>
														{ cand.text }
													</p>
												</>
											) }
											{ rewrite.action === 'fix' &&
												cand.why && (
													<p
														className="coach-candidate-why"
														data-testid={ `draft-coach-candidate-why-${ i }` }
													>
														{ cand.why }
													</p>
												) }
											<div className="coach-candidate-actions">
												<button
													type="button"
													className="check-action-button check-action-button-primary"
													data-testid={ `draft-coach-candidate-apply-${ i }` }
													onClick={ () =>
														onApplyCandidate(
															cand.text
														)
													}
												>
													Apply
												</button>
											</div>
										</div>
									) ) }
								</div>
							) }
						</>
					) }
				</div>
			</section>

			{ /* ---- Go deeper (Structure) ---- */ }
			<section className="coach-flow-section">
				<div className="coach-flow-head">
					<span className="coach-flow-title">Go deeper</span>
					<span className="coach-flow-muted">structure</span>
				</div>
				<div className="coach-section-body">
					<button
						type="button"
						className="coach-structure-run"
						data-testid="draft-coach-structure-run"
						disabled={ structureRunning }
						onClick={ onReviewStructure }
					>
						{ structureRunning ? 'Reviewing…' : 'Review structure' }
					</button>
					{ structureError && (
						<p
							className="coach-review-error"
							data-testid="draft-coach-structure-error"
						>
							{ structureError }
						</p>
					) }
					{ ! structureError &&
						hasStructure &&
						! structureRunning &&
						structureNotes.length === 0 && (
							<p className="coach-review-empty">
								Structure looks sound. 🎉
							</p>
						) }
					<ul className="coach-structure-list">
						{ structureNotes.map( ( n ) => {
							const locatable = n.from >= 0;
							return (
								<li
									key={ n.id }
									className="coach-structure-note"
									data-testid={ `draft-coach-structure-note-${ n.id }` }
								>
									<button
										type="button"
										className="coach-structure-note-body"
										data-locatable={ locatable }
										disabled={ ! locatable }
										onClick={ () =>
											locatable &&
											onSelectStructureNote( n.id )
										}
									>
										<span className="coach-structure-note-label">
											{ n.label }
										</span>
										<span className="coach-structure-note-text">
											{ n.note }
										</span>
									</button>
								</li>
							);
						} ) }
					</ul>
				</div>
			</section>
		</div>
	);
}
