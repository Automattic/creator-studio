import React, { useMemo, useState } from 'react';

import { ChevronIcon } from '../icons';
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
	scanning: boolean;
	scanError: string | null;
	hasScanned: boolean;
	onScan: () => void;
	onSelectIssue: ( id: string ) => void;
	onApplyIssues: ( ids: string[] ) => void;
	onDismissIssues: ( ids: string[] ) => void;
	// Rubric scorecard (opt-in)
	scoreDimensions: CoachScoreDimension[];
	scoreRunning: boolean;
	scoreError: string | null;
	onScore: () => void;
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

type SectionId = 'review' | 'rewrite' | 'structure';

export function CoachPanel( {
	issues,
	body,
	register,
	visibleCategories,
	onToggleCategory,
	activeIssueId,
	scanning,
	scanError,
	hasScanned,
	onScan,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
	scoreDimensions,
	scoreRunning,
	scoreError,
	onScore,
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
	const [ open, setOpen ] = useState< Record< SectionId, boolean > >( {
		review: true,
		rewrite: true,
		structure: false,
	} );
	const toggle = ( id: SectionId ): void =>
		setOpen( ( prev ) => ( { ...prev, [ id ]: ! prev[ id ] } ) );

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
			{ /* ---- Review ---- */ }
			<section className="coach-section" data-open={ open.review }>
				<button
					type="button"
					className="coach-section-head"
					data-testid="draft-coach-review-head"
					onClick={ () => toggle( 'review' ) }
				>
					<ChevronIcon
						size={ 12 }
						className="coach-section-chevron"
					/>
					<span className="coach-section-title">Review</span>
					<span className="coach-section-muted">whole document</span>
					<span
						className="coach-section-meta coach-rescan"
						data-testid="draft-coach-rescan"
						role="button"
						tabIndex={ 0 }
						onClick={ ( e ) => {
							e.stopPropagation();
							if ( ! scanning ) {
								onScan();
							}
						} }
						onKeyDown={ ( e ) => {
							if ( e.key === 'Enter' || e.key === ' ' ) {
								e.preventDefault();
								e.stopPropagation();
								if ( ! scanning ) {
									onScan();
								}
							}
						} }
					>
						{ scanning ? 'Scanning…' : 'Rescan' }
					</span>
				</button>
				{ open.review && (
					<div className="coach-section-body">
						{ summary && (
							<div
								className="coach-summary"
								data-testid="draft-coach-summary"
							>
								{ summary }
							</div>
						) }
						<div className="coach-scorecard">
							<button
								type="button"
								className="coach-score-run"
								data-testid="draft-coach-score-run"
								disabled={ scoreRunning }
								onClick={ onScore }
							>
								{ scoreRunning
									? 'Scoring…'
									: 'Score this draft' }
							</button>
							{ scoreError && (
								<p
									className="coach-review-error"
									data-testid="draft-coach-score-error"
								>
									{ scoreError }
								</p>
							) }
							{ scoreDimensions.length > 0 && (
								<ul
									className="coach-score-list"
									data-testid="draft-coach-score-list"
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
										visibleCategories[ cat.id ]
											? 'on'
											: 'off'
									}` }
									data-testid={ `draft-coach-cat-${ cat.id }` }
									onClick={ () => onToggleCategory( cat.id ) }
								>
									{ cat.label } { counts[ cat.id ] }
								</button>
							) ) }
						</div>
						{ scanError && (
							<p
								className="coach-review-error"
								data-testid="draft-coach-scan-error"
							>
								{ scanError }
							</p>
						) }
						{ ! scanError &&
							hasScanned &&
							! scanning &&
							issues.length === 0 && (
								<p className="coach-review-empty">
									Looks clean. 🎉
								</p>
							) }
						{ ! scanError &&
							! hasScanned &&
							! scanning &&
							issues.length === 0 && (
								<p className="coach-review-empty">
									Scanning finds grammar, style, and AI
									issues.
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
										onClick={ () =>
											onSelectIssue( issue.id )
										}
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
														<b>
															{
																issue.replacement
															}
														</b>
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
				) }
			</section>

			{ /* ---- Rewrite ---- */ }
			<section className="coach-section" data-open={ open.rewrite }>
				<button
					type="button"
					className="coach-section-head"
					data-testid="draft-coach-rewrite-head"
					onClick={ () => toggle( 'rewrite' ) }
				>
					<ChevronIcon
						size={ 12 }
						className="coach-section-chevron"
					/>
					<span className="coach-section-title">Rewrite</span>
					<span className="coach-section-muted">selection</span>
				</button>
				{ open.rewrite && (
					<div className="coach-section-body">
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
											active ? ' coach-action-active' : ''
										}` }
										data-testid={ `draft-coach-action-${ action.id }` }
										aria-pressed={ active }
										disabled={
											! hasSelection ||
											rewrite.status === 'running'
										}
										onClick={ () => onRewrite( action.id ) }
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
							<p className="coach-rewrite-status">Rewriting…</p>
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
									Suggestion
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
										{ cand.why && (
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
					</div>
				) }
			</section>

			{ /* ---- Structure (opt-in) ---- */ }
			<section className="coach-section" data-open={ open.structure }>
				<button
					type="button"
					className="coach-section-head"
					data-testid="draft-coach-structure-head"
					onClick={ () => toggle( 'structure' ) }
				>
					<ChevronIcon
						size={ 12 }
						className="coach-section-chevron"
					/>
					<span className="coach-section-title">Structure</span>
					<span className="coach-section-muted">whole document</span>
				</button>
				{ open.structure && (
					<div className="coach-section-body">
						<button
							type="button"
							className="coach-structure-run"
							data-testid="draft-coach-structure-run"
							disabled={ structureRunning }
							onClick={ onReviewStructure }
						>
							{ structureRunning
								? 'Reviewing…'
								: 'Review structure' }
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
				) }
			</section>
		</div>
	);
}
