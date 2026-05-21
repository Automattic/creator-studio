import { describe, expect, test } from 'vitest';

import { describeSchedule } from '../../src/renderer/lib/describeSchedule';

describe( 'describeSchedule', () => {
	test( 'manual', () => {
		expect( describeSchedule( { kind: 'manual' } ) ).toBe( 'Manual' );
	} );

	test( 'hourly', () => {
		expect( describeSchedule( { kind: 'hourly' } ) ).toBe( 'Hourly' );
	} );

	test( 'daily includes the time', () => {
		expect( describeSchedule( { kind: 'daily', time: '09:00' } ) ).toBe(
			'Daily · 09:00'
		);
	} );

	test( 'weekdays includes the time', () => {
		expect( describeSchedule( { kind: 'weekdays', time: '08:30' } ) ).toBe(
			'Weekdays · 08:30'
		);
	} );

	test( 'weekly names the day', () => {
		expect(
			describeSchedule( { kind: 'weekly', weekday: 1, time: '09:00' } )
		).toBe( 'Weekly · Monday · 09:00' );
		expect(
			describeSchedule( { kind: 'weekly', weekday: 0, time: '17:00' } )
		).toBe( 'Weekly · Sunday · 17:00' );
	} );
} );
