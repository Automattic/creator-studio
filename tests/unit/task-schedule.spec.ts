import { describe, expect, test } from 'vitest';

import { mostRecentDue } from '../../src/main/channels/utils/task-schedule';

// All arithmetic is local-time; tests build both `now` and the expected
// result with local Date construction so they are timezone-independent.
describe( 'mostRecentDue', () => {
	test( 'manual never has a due time', () => {
		const now = new Date( 2026, 4, 20, 14, 30 ).getTime();
		expect( mostRecentDue( { kind: 'manual' }, now ) ).toBeNull();
	} );

	test( 'hourly resolves to the top of the current hour', () => {
		const now = new Date( 2026, 4, 20, 14, 30, 45, 123 ).getTime();
		expect( mostRecentDue( { kind: 'hourly' }, now ) ).toBe(
			new Date( 2026, 4, 20, 14, 0, 0, 0 ).getTime()
		);
	} );

	test( "daily uses today's slot once its time has passed", () => {
		const now = new Date( 2026, 4, 20, 14, 30 ).getTime();
		expect( mostRecentDue( { kind: 'daily', time: '09:00' }, now ) ).toBe(
			new Date( 2026, 4, 20, 9, 0, 0, 0 ).getTime()
		);
	} );

	test( "daily falls back to yesterday before today's time", () => {
		const now = new Date( 2026, 4, 20, 14, 30 ).getTime();
		expect( mostRecentDue( { kind: 'daily', time: '18:00' }, now ) ).toBe(
			new Date( 2026, 4, 19, 18, 0, 0, 0 ).getTime()
		);
	} );

	test( 'weekly resolves to the most recent matching weekday', () => {
		const now = new Date( 2026, 4, 20, 14, 30 );
		const today = now.getDay();
		// Same weekday, time already passed → today.
		expect(
			mostRecentDue(
				{ kind: 'weekly', weekday: today, time: '09:00' },
				now.getTime()
			)
		).toBe( new Date( 2026, 4, 20, 9, 0, 0, 0 ).getTime() );
		// Yesterday's weekday → yesterday.
		expect(
			mostRecentDue(
				{
					kind: 'weekly',
					weekday: ( today + 6 ) % 7,
					time: '09:00',
				},
				now.getTime()
			)
		).toBe( new Date( 2026, 4, 19, 9, 0, 0, 0 ).getTime() );
	} );

	test( "monthly uses this month's slot once its day/time has passed", () => {
		const now = new Date( 2026, 4, 20, 14, 30 ).getTime();
		expect(
			mostRecentDue(
				{ kind: 'monthly', dayOfMonth: 15, time: '09:00' },
				now
			)
		).toBe( new Date( 2026, 4, 15, 9, 0, 0, 0 ).getTime() );
	} );

	test( "monthly falls back to last month before this month's day", () => {
		const now = new Date( 2026, 4, 20, 14, 30 ).getTime();
		expect(
			mostRecentDue(
				{ kind: 'monthly', dayOfMonth: 25, time: '09:00' },
				now
			)
		).toBe( new Date( 2026, 3, 25, 9, 0, 0, 0 ).getTime() );
	} );

	test( 'monthly clamps the day to the last day of a short month', () => {
		// March 5 — day 31 has not arrived this month, and February 2026
		// only has 28 days, so the slot lands on Feb 28.
		const now = new Date( 2026, 2, 5, 12, 0 ).getTime();
		expect(
			mostRecentDue(
				{ kind: 'monthly', dayOfMonth: 31, time: '09:00' },
				now
			)
		).toBe( new Date( 2026, 1, 28, 9, 0, 0, 0 ).getTime() );
	} );
} );
