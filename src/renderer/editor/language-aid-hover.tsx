import React from 'react';

import { StateEffect, StateField } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	hoverTooltip,
	type Tooltip,
} from '@codemirror/view';
import { createRoot, type Root } from 'react-dom/client';

import {
	LanguageAidPopover,
	type LanguageAidPopoverState,
} from '../components/LanguageAidPopover';
import type { LanguageAidResult } from '../../types';

type Ranges = {
	wordFrom: number;
	wordTo: number;
	sentenceFrom: number;
	sentenceTo: number;
};

// Effects driving the two hover decorations (word + enclosing sentence).
// Dispatched by the tooltip lifecycle so the decoration only paints while
// the popover is open.
export const setHoverRangesEffect = StateEffect.define< Ranges >();
export const clearHoverEffect = StateEffect.define< null >();

function buildHoverDecorations( r: Ranges, docLen: number ): DecorationSet {
	const out = [];
	if ( r.sentenceFrom < r.sentenceTo && r.sentenceTo <= docLen ) {
		out.push(
			Decoration.mark( { class: 'cm-langaid-sentence' } ).range(
				r.sentenceFrom,
				r.sentenceTo
			)
		);
	}
	if ( r.wordFrom < r.wordTo && r.wordTo <= docLen ) {
		out.push(
			Decoration.mark( { class: 'cm-langaid-word' } ).range(
				r.wordFrom,
				r.wordTo
			)
		);
	}
	return Decoration.set( out, true );
}

export const languageAidField = StateField.define< DecorationSet >( {
	create: () => Decoration.none,
	update( value, tr ) {
		for ( const effect of tr.effects ) {
			if ( effect.is( setHoverRangesEffect ) ) {
				return buildHoverDecorations(
					effect.value,
					tr.state.doc.length
				);
			}
			if ( effect.is( clearHoverEffect ) ) {
				return Decoration.none;
			}
		}
		// Any doc change invalidates the offsets — drop the decoration
		// rather than re-mapping it. The tooltip itself closes via
		// hideOnChange below, so this just keeps the styling in sync.
		if ( tr.docChanged ) {
			return Decoration.none;
		}
		return value;
	},
	provide: ( field ) => EditorView.decorations.from( field ),
} );

// Find the sentence containing [from, to). Looks ±500 chars around the
// word; if no `[.!?]` boundary lives in that window, falls back to the
// window edge.
export function findSentenceRange(
	view: EditorView,
	from: number,
	to: number
): { from: number; to: number } {
	const doc = view.state.doc;
	const lookbackStart = Math.max( 0, from - 500 );
	const lookaheadEnd = Math.min( doc.length, to + 500 );
	const before = doc.sliceString( lookbackStart, from );
	const after = doc.sliceString( to, lookaheadEnd );

	let lastBoundary = 0;
	const back = /[.!?]+\s+(?=\S)/g;
	let m: RegExpExecArray | null;
	while ( ( m = back.exec( before ) ) !== null ) {
		lastBoundary = m.index + m[ 0 ].length;
	}
	const sentFrom = lookbackStart + lastBoundary;

	const fwd = /[.!?](?:\s|$)/.exec( after );
	const sentTo = fwd ? to + fwd.index + 1 : lookaheadEnd;

	return { from: sentFrom, to: sentTo };
}

// Walk lines outward from the word until a blank line on each side. Bounded
// to keep the payload small.
export function findParagraphRange(
	view: EditorView,
	from: number,
	to: number
): { from: number; to: number } {
	const doc = view.state.doc;
	const startLine = doc.lineAt( from );
	const endLine = doc.lineAt( to );
	let topLine = startLine.number;
	while ( topLine > 1 ) {
		const prev = doc.line( topLine - 1 );
		if ( prev.text.trim() === '' ) {
			break;
		}
		topLine -= 1;
	}
	let bottomLine = endLine.number;
	while ( bottomLine < doc.lines ) {
		const next = doc.line( bottomLine + 1 );
		if ( next.text.trim() === '' ) {
			break;
		}
		bottomLine += 1;
	}
	const paraFrom = doc.line( topLine ).from;
	const paraTo = doc.line( bottomLine ).to;
	// Cap to keep prompts cheap; the backend caps again but trimming
	// renderer-side avoids serializing a huge string across IPC.
	const MAX = 4_000;
	if ( paraTo - paraFrom <= MAX ) {
		return { from: paraFrom, to: paraTo };
	}
	const half = Math.floor( MAX / 2 );
	return {
		from: Math.max( paraFrom, from - half ),
		to: Math.min( paraTo, to + half ),
	};
}

type Options = {
	getEnabled: () => boolean;
	getProjectId: () => string | null;
};

// LRU cache keyed by `${word}::${sentence}` so repeating hovers on the
// same span return instantly. Map preserves insertion order, so we drop
// the oldest entry when full.
const MAX_CACHE = 50;

function rememberInLru(
	cache: Map< string, LanguageAidResult >,
	key: string,
	value: LanguageAidResult
): void {
	if ( cache.has( key ) ) {
		cache.delete( key );
	}
	cache.set( key, value );
	while ( cache.size > MAX_CACHE ) {
		const firstKey = cache.keys().next().value;
		if ( firstKey === undefined ) {
			break;
		}
		cache.delete( firstKey );
	}
}

export function languageAidHoverTooltip( opts: Options ) {
	const cache = new Map< string, LanguageAidResult >();

	const source = ( view: EditorView, pos: number ): Tooltip | null => {
		if ( ! opts.getEnabled() ) {
			return null;
		}
		const projectId = opts.getProjectId();
		if ( ! projectId ) {
			return null;
		}
		const wordRange = view.state.wordAt( pos );
		if ( ! wordRange ) {
			return null;
		}
		const word = view.state.doc.sliceString( wordRange.from, wordRange.to );
		if ( ! word.trim() ) {
			return null;
		}
		const sentence = findSentenceRange(
			view,
			wordRange.from,
			wordRange.to
		);
		const paragraph = findParagraphRange(
			view,
			wordRange.from,
			wordRange.to
		);
		const sentenceText = view.state.doc.sliceString(
			sentence.from,
			sentence.to
		);
		const paragraphText = view.state.doc.sliceString(
			paragraph.from,
			paragraph.to
		);
		const cacheKey = `${ word }::${ sentenceText }`;

		return {
			pos: wordRange.from,
			end: wordRange.to,
			above: true,
			arrow: false,
			create: ( hostView ) => {
				const dom = document.createElement( 'div' );
				dom.className = 'language-aid-popover-mount';
				const root: Root = createRoot( dom );
				let mounted = true;

				// CM6 hosts tooltips inside a view update; dispatching back
				// into the view synchronously here throws
				// "Calls to EditorView.update are not allowed while an
				// update is in progress". Defer the decoration paint to the
				// next microtask so the host's update has settled first.
				queueMicrotask( () => {
					if ( ! mounted ) {
						return;
					}
					try {
						hostView.dispatch( {
							effects: setHoverRangesEffect.of( {
								wordFrom: wordRange.from,
								wordTo: wordRange.to,
								sentenceFrom: sentence.from,
								sentenceTo: sentence.to,
							} ),
						} );
					} catch {
						// view already torn down before we got the chance
					}
				} );

				// Replace the hovered word with a synonym, or the whole
				// enclosing sentence with a rewrite. Both ranges were captured
				// at hover time; hideOnChange guarantees no edit has landed
				// since, so the offsets are still valid. The dispatch triggers
				// hideOnChange, closing the tooltip once the change lands.
				const applyChange = (
					from: number,
					to: number,
					insert: string
				): void => {
					try {
						const len = hostView.state.doc.length;
						hostView.dispatch( {
							changes: {
								from: Math.min( from, len ),
								to: Math.min( to, len ),
								insert,
							},
						} );
					} catch {
						// view torn down before the click landed
					}
				};
				const onApplySynonym = ( syn: string ): void =>
					applyChange( wordRange.from, wordRange.to, syn );
				const onApplyRewrite = ( text: string ): void =>
					applyChange( sentence.from, sentence.to, text );
				const render = ( state: LanguageAidPopoverState ): void => {
					if ( ! mounted ) {
						return;
					}
					root.render(
						<LanguageAidPopover
							state={ state }
							onApplySynonym={ onApplySynonym }
							onApplyRewrite={ onApplyRewrite }
						/>
					);
				};

				const cached = cache.get( cacheKey );
				if ( cached ) {
					render( { kind: 'ready', word, result: cached } );
				} else {
					render( { kind: 'loading', word } );
					void window.api.languageAid
						.explain( {
							projectId,
							word,
							sentence: sentenceText,
							paragraph: paragraphText,
						} )
						.then( ( result ) => {
							rememberInLru( cache, cacheKey, result );
							render( { kind: 'ready', word, result } );
						} )
						.catch( ( err: unknown ) => {
							render( {
								kind: 'error',
								word,
								message:
									err instanceof Error
										? err.message
										: 'Request failed',
							} );
						} );
				}

				return {
					dom,
					destroy: () => {
						mounted = false;
						// React 18 disallows unmount during commit phases.
						queueMicrotask( () => root.unmount() );
						// dispatch throws if the view was destroyed first
						// (closing the draft tears the editor down before
						// the tooltip lifecycle). Silently skip — the
						// decoration goes with the dying view anyway.
						try {
							hostView.dispatch( {
								effects: clearHoverEffect.of( null ),
							} );
						} catch {
							// editor already gone
						}
					},
				};
			},
		};
	};

	return [
		languageAidField,
		hoverTooltip( source, {
			hoverTime: 350,
			hideOnChange: true,
		} ),
	];
}
