import type { CoachScoreDimension } from '../../types';

// The headline score shown on the Coach dashboard is the rounded mean of the
// four rubric dimensions, so it can never disagree with the breakdown. Returns
// null when there are no dimensions yet (nothing to average).
export function headlineScore(
	dimensions: ReadonlyArray< CoachScoreDimension >
): number | null {
	if ( dimensions.length === 0 ) {
		return null;
	}
	const sum = dimensions.reduce( ( acc, d ) => acc + d.score, 0 );
	return Math.round( sum / dimensions.length );
}
