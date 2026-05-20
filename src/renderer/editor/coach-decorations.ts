import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import type { CoachIssue } from '../../types';

// Coach reuses the apply-annotation from checks so a Coach Apply edit
// survives the "manual edit clears results" rule the same way.
export { applyAnnotation, isApplyTransaction } from './draft-check-decorations';

export const setCoachIssuesEffect = StateEffect.define< CoachIssue[] >();
export const setActiveCoachIssueEffect = StateEffect.define< string | null >();
export const clearCoachIssuesEffect = StateEffect.define< null >();

type InnerState = {
	issues: CoachIssue[];
	activeId: string | null;
	decorations: DecorationSet;
};

const EMPTY: InnerState = {
	issues: [],
	activeId: null,
	decorations: Decoration.none,
};

function buildDecorations(
	issues: CoachIssue[],
	activeId: string | null,
	docLen: number
): DecorationSet {
	if ( issues.length === 0 ) {
		return Decoration.none;
	}
	const ranges = [ ...issues ]
		.sort( ( a, b ) => a.from - b.from || a.to - b.to )
		.filter( ( i ) => i.from >= 0 && i.to <= docLen && i.from < i.to )
		.map( ( issue ) => {
			const active =
				issue.id === activeId ? ' cm-coach-issue-active' : '';
			return Decoration.mark( {
				class: `cm-coach-issue cm-coach-issue-${ issue.category }${ active }`,
				attributes: { 'data-coach-issue-id': issue.id },
			} ).range( issue.from, issue.to );
		} );
	return Decoration.set( ranges, true );
}

export const coachIssuesField = StateField.define< InnerState >( {
	create: () => EMPTY,
	update( value, tr ) {
		let issues = value.issues;
		let activeId = value.activeId;
		let dirty = false;
		for ( const effect of tr.effects ) {
			if ( effect.is( setCoachIssuesEffect ) ) {
				issues = effect.value;
				dirty = true;
			} else if ( effect.is( setActiveCoachIssueEffect ) ) {
				activeId = effect.value;
				dirty = true;
			} else if ( effect.is( clearCoachIssuesEffect ) ) {
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
