import { useEffect, useState } from 'react';

export type FileTextState =
	| { status: 'loading' }
	| { status: 'loaded'; text: string }
	| { status: 'error' };

// Streams the contents of an in-project file into the renderer, re-reading
// whenever `reloadNonce` changes. On a refresh (nonce > 0) we keep the
// previously loaded text on screen instead of flashing "Loading…", so an
// agent overwrite doesn't cause a visible blank between turns.
export function useFileText(
	projectId: string,
	subPath: string,
	reloadNonce: number
): FileTextState {
	const [ state, setState ] = useState< FileTextState >( {
		status: 'loading',
	} );

	useEffect( () => {
		let cancelled = false;
		if ( reloadNonce === 0 ) {
			setState( { status: 'loading' } );
		}
		void window.api.project
			.readFile( projectId, subPath )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setState( { status: 'error' } );
					return;
				}
				setState( { status: 'loaded', text: res.text } );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, subPath, reloadNonce ] );

	return state;
}
