import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type Options< T > = {
	value: T;
	enabled: boolean;
	save: ( value: T ) => Promise< 'ok' | 'error' >;
	eq?: ( a: T, b: T ) => boolean;
	debounceMs?: number;
};

export function useAutoSave< T >( opts: Options< T > ): {
	state: SaveState;
	flush: () => Promise< void >;
} {
	const { value, enabled, save, eq, debounceMs = 1000 } = opts;
	const [ state, setState ] = useState< SaveState >( 'idle' );

	// `lastSaved` is the snapshot we last persisted (or initial value once
	// enabled). `pending` is whatever the editor handed us most recently.
	// We compare the two to decide whether a save is needed; the eq override
	// lets callers do shallow/structural compares for object payloads.
	const lastSavedRef = useRef< T | null >( null );
	const pendingRef = useRef< T >( value );
	const timerRef = useRef< ReturnType< typeof setTimeout > | null >( null );
	const inflightRef = useRef< Promise< void > | null >( null );

	pendingRef.current = value;

	const equal = useCallback(
		( a: T, b: T ): boolean => ( eq ? eq( a, b ) : a === b ),
		[ eq ]
	);

	const doSave = useCallback( async (): Promise< void > => {
		// Coalesce concurrent flushes: if a save is in-flight, await it and
		// then re-check whether the latest value was already covered.
		if ( inflightRef.current ) {
			await inflightRef.current;
		}
		const snapshot = pendingRef.current;
		if (
			lastSavedRef.current !== null &&
			equal( snapshot, lastSavedRef.current )
		) {
			return;
		}
		setState( 'saving' );
		const promise = ( async () => {
			const result = await save( snapshot );
			if ( result === 'ok' ) {
				lastSavedRef.current = snapshot;
				// If something edited while saving, mark dirty so the next
				// debounce tick flushes it; otherwise we're saved.
				if ( ! equal( pendingRef.current, snapshot ) ) {
					setState( 'dirty' );
				} else {
					setState( 'saved' );
				}
			} else {
				setState( 'error' );
			}
		} )();
		inflightRef.current = promise;
		await promise;
		inflightRef.current = null;
	}, [ equal, save ] );

	// Track value changes — debounce the save.
	useEffect( () => {
		if ( ! enabled ) {
			return;
		}
		if ( lastSavedRef.current === null ) {
			// First time we see a value with `enabled`; treat as the saved
			// baseline so we don't immediately fire a save for the loaded doc.
			lastSavedRef.current = value;
			setState( 'idle' );
			return;
		}
		if ( equal( value, lastSavedRef.current ) ) {
			return;
		}
		setState( 'dirty' );
		if ( timerRef.current ) {
			clearTimeout( timerRef.current );
		}
		timerRef.current = setTimeout( () => {
			void doSave();
		}, debounceMs );
		return () => {
			if ( timerRef.current ) {
				clearTimeout( timerRef.current );
			}
		};
	}, [ value, enabled, equal, doSave, debounceMs ] );

	// Flush on window blur (user switched apps / tab) and on unmount.
	useEffect( () => {
		if ( ! enabled ) {
			return;
		}
		const onBlur = (): void => {
			void doSave();
		};
		window.addEventListener( 'blur', onBlur );
		return () => {
			window.removeEventListener( 'blur', onBlur );
			void doSave();
		};
	}, [ enabled, doSave ] );

	return { state, flush: doSave };
}
