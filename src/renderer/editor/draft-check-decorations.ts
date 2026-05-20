import {
	Annotation,
	StateEffect,
	StateField,
	type Transaction,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import { checkColorStyleString } from '../lib/checkColor';
import type { DraftCheckIssue } from '../../types';

// Tags transactions that came from an Apply (replacement of an issue
// range). The docChanged-clears handler skips these — the user-facing
// rule is "any *manual* edit clears check results", and an Apply is a
// programmatic edit we want to survive.
export const applyAnnotation = Annotation.define< true >();

export function isApplyTransaction( tr: Transaction ): boolean {
	return tr.annotation( applyAnnotation ) === true;
}

// Replace the entire issue set (most common — dispatched whenever
// `checkIssues` changes in React state).
export const setIssuesEffect = StateEffect.define< DraftCheckIssue[] >();
// Highlight one issue as the user's current focus (sidebar row click,
// mark click). null clears the active marker without touching the rest.
export const setActiveIssueEffect = StateEffect.define< string | null >();
// Drop everything — used by the edit-clears-results path in a follow-up
// commit. Listed here so the StateField API is complete in one place.
export const clearIssuesEffect = StateEffect.define< null >();

type InnerState = {
	issues: DraftCheckIssue[];
	activeId: string | null;
	decorations: DecorationSet;
};

const EMPTY: InnerState = {
	issues: [],
	activeId: null,
	decorations: Decoration.none,
};

function buildDecorations(
	issues: DraftCheckIssue[],
	activeId: string | null,
	docLen: number
): DecorationSet {
	if ( issues.length === 0 ) {
		return Decoration.none;
	}
	const sorted = [ ...issues ].sort(
		( a, b ) => a.from - b.from || a.to - b.to
	);
	const ranges = sorted
		.filter( ( i ) => i.from >= 0 && i.to <= docLen && i.from < i.to )
		.map( ( issue ) => {
			const activeClass =
				issue.id === activeId ? ' cm-check-issue-active' : '';
			return Decoration.mark( {
				class: `cm-check-issue${ activeClass }`,
				attributes: {
					'data-issue-id': issue.id,
					'data-check-rel-path': issue.checkRelPath,
					style: checkColorStyleString( issue.checkRelPath ),
				},
			} ).range( issue.from, issue.to );
		} );
	return Decoration.set( ranges, true );
}

export type IssueChange = { from: number; to: number; insert: string };

// The bulk-apply offset math only needs an id and a replaceable range, so
// the planner/shifter are generic over any issue shape sharing this
// contract — both DraftCheckIssue and CoachIssue qualify.
export type ApplicableIssue = {
	id: string;
	from: number;
	to: number;
	replacement: string;
};

// Compute the CodeMirror changes and the post-apply issue survivor list
// for a bulk-apply request. The handler in DraftEditorScreen turns the
// resulting `changes[]` into a single transaction so undo collapses to
// one step; this pure helper keeps the algorithm testable in isolation.
//
// Algorithm: process targets in descending `from` order. Each iteration's
// CodeMirror change is dispatched against the *unchanged* left portion of
// the doc, so its offsets stay valid. `shiftIssuesAfterApply` advances the
// survivors list — issues that overlapped an already-applied target drop
// out naturally because they're missing from the survivors on the next
// iteration. The caller passes any `ids` order; we sort internally.
export function planBulkApply< T extends ApplicableIssue >(
	issues: T[],
	ids: string[]
): { changes: IssueChange[]; survivors: T[] } {
	if ( ids.length === 0 ) {
		return { changes: [], survivors: issues };
	}
	const idSet = new Set( ids );
	const targetsDesc = issues
		.filter( ( i ) => idSet.has( i.id ) )
		.slice()
		.sort( ( a, b ) => b.from - a.from );

	let survivors: T[] = issues;
	const changes: IssueChange[] = [];
	for ( const target of targetsDesc ) {
		const current = survivors.find( ( i ) => i.id === target.id );
		if ( ! current ) {
			continue;
		}
		changes.push( {
			from: current.from,
			to: current.to,
			insert: current.replacement,
		} );
		survivors = shiftIssuesAfterApply( survivors, current );
	}
	return { changes, survivors };
}

// Result of applying one issue: the new doc length-adjusted issue list
// to feed back into React state. Drops the applied issue plus any issue
// whose range overlaps the replaced span; remaining issues' offsets are
// shifted by the change (length delta inserted at `from`).
export function shiftIssuesAfterApply< T extends ApplicableIssue >(
	issues: T[],
	applied: ApplicableIssue
): T[] {
	const replacedFrom = applied.from;
	const replacedTo = applied.to;
	const delta = applied.replacement.length - ( replacedTo - replacedFrom );
	const out: T[] = [];
	for ( const issue of issues ) {
		if ( issue.id === applied.id ) {
			continue;
		}
		// Drop issues that overlap the replaced range — their `original`
		// no longer describes the doc after the rewrite.
		if ( issue.from < replacedTo && issue.to > replacedFrom ) {
			continue;
		}
		if ( issue.from >= replacedTo ) {
			out.push( {
				...issue,
				from: issue.from + delta,
				to: issue.to + delta,
			} );
		} else {
			out.push( issue );
		}
	}
	return out;
}

export const checkIssuesField = StateField.define< InnerState >( {
	create: () => EMPTY,
	update( value, tr ) {
		let issues = value.issues;
		let activeId = value.activeId;
		let dirty = false;
		for ( const effect of tr.effects ) {
			if ( effect.is( setIssuesEffect ) ) {
				issues = effect.value;
				dirty = true;
			} else if ( effect.is( setActiveIssueEffect ) ) {
				activeId = effect.value;
				dirty = true;
			} else if ( effect.is( clearIssuesEffect ) ) {
				issues = [];
				activeId = null;
				dirty = true;
			}
		}
		if ( ! dirty ) {
			return value;
		}
		return {
			issues,
			activeId,
			decorations: buildDecorations(
				issues,
				activeId,
				tr.state.doc.length
			),
		};
	},
	provide: ( field ) =>
		EditorView.decorations.from( field, ( v ) => v.decorations ),
} );
