/**
 * Pure schedule arithmetic for the task scheduler. Kept separate from
 * TaskManager so it can be unit-tested with an injected `now`.
 */
import type { TaskSchedule } from '../../../types';

// The most recent timestamp at which `schedule` was due, at or before `now`.
// Returns null for `manual` (never auto-runs). All arithmetic is in local
// time, matching how the user picked the schedule.
export function mostRecentDue(
	schedule: TaskSchedule,
	now: number
): number | null {
	if ( schedule.kind === 'manual' ) {
		return null;
	}
	if ( schedule.kind === 'hourly' ) {
		const t = new Date( now );
		t.setMinutes( 0, 0, 0 );
		return t.getTime();
	}

	// daily / weekly / monthly all carry an "HH:MM" time.
	const [ hh, mm ] = schedule.time
		.split( ':' )
		.map( ( s ) => parseInt( s, 10 ) );
	if ( Number.isNaN( hh ) || Number.isNaN( mm ) ) {
		return null;
	}

	if ( schedule.kind === 'daily' ) {
		const t = new Date( now );
		t.setHours( hh, mm, 0, 0 );
		if ( t.getTime() <= now ) {
			return t.getTime();
		}
		t.setDate( t.getDate() - 1 );
		return t.getTime();
	}

	if ( schedule.kind === 'monthly' ) {
		// Try this month's slot, then last month's. The day is clamped to the
		// last day of months too short to contain it.
		for ( let back = 0; back <= 1; back++ ) {
			const t = new Date( now );
			t.setDate( 1 );
			t.setMonth( t.getMonth() - back );
			const lastDay = new Date(
				t.getFullYear(),
				t.getMonth() + 1,
				0
			).getDate();
			t.setDate( Math.min( schedule.dayOfMonth, lastDay ) );
			t.setHours( hh, mm, 0, 0 );
			if ( t.getTime() <= now ) {
				return t.getTime();
			}
		}
		return null;
	}

	// weekly: walk back day by day to the most recent matching weekday whose
	// HH:MM has already passed.
	const t = new Date( now );
	t.setHours( hh, mm, 0, 0 );
	for ( let i = 0; i < 8; i++ ) {
		if ( t.getDay() === schedule.weekday && t.getTime() <= now ) {
			return t.getTime();
		}
		t.setDate( t.getDate() - 1 );
	}
	return null;
}
