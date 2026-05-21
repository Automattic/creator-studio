import type { TaskSchedule } from '../../types';
import { ordinal } from './ordinal';

const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

// Human-readable one-line description of a task schedule, e.g. "Daily · 09:00".
export function describeSchedule( schedule: TaskSchedule ): string {
	switch ( schedule.kind ) {
		case 'manual':
			return 'Manual';
		case 'hourly':
			return 'Hourly';
		case 'daily':
			return `Daily · ${ schedule.time }`;
		case 'weekly':
			return `Weekly · ${
				WEEKDAY_NAMES[ schedule.weekday ] ?? 'Sunday'
			} · ${ schedule.time }`;
		case 'monthly':
			return `Monthly · ${ ordinal( schedule.dayOfMonth ) } · ${
				schedule.time
			}`;
	}
}
