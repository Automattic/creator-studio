import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import type { DraftCheckIssue } from '../../types';

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
				class: `cm-check-issue cm-check-issue-${ issue.kind }${ activeClass }`,
				attributes: {
					'data-issue-id': issue.id,
					'data-check-kind': issue.kind,
				},
			} ).range( issue.from, issue.to );
		} );
	return Decoration.set( ranges, true );
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
