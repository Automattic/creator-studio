const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const MONTH_LABELS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

export function relativeDate(
	mtime: number,
	now: number = Date.now()
): string {
	const diff = now - mtime;
	if ( diff < 0 ) {
		return 'now';
	}
	if ( diff < MINUTE ) {
		return 'now';
	}
	if ( diff < HOUR ) {
		return `${ Math.floor( diff / MINUTE ) }m`;
	}
	if ( diff < DAY ) {
		return `${ Math.floor( diff / HOUR ) }h`;
	}
	if ( diff < WEEK ) {
		return `${ Math.floor( diff / DAY ) }d`;
	}
	const date = new Date( mtime );
	const nowDate = new Date( now );
	if ( date.getFullYear() !== nowDate.getFullYear() ) {
		return String( date.getFullYear() );
	}
	return `${ MONTH_LABELS[ date.getMonth() ] } ${ date.getDate() }`;
}
