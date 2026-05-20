// The date fields a WP REST post carries. Both the site-local and `_gmt`
// (UTC) variants are optional — hardened sites can strip either.
export type WpPostDates = {
	date?: string;
	date_gmt?: string;
	modified?: string;
	modified_gmt?: string;
};

// The moment a post last changed on WordPress, used to backdate the imported
// file's mtime. WP REST datetime strings carry no timezone suffix; the `_gmt`
// variants are UTC, so they must be parsed with an explicit `Z`. The
// site-local variants are a last resort — parsed as machine-local, which is
// only reached when the GMT fields are absent.
export function pickPostModifiedDate( post: WpPostDates ): Date | null {
	const utc = post.modified_gmt ?? post.date_gmt;
	if ( utc ) {
		const d = new Date( /[zZ]$/.test( utc ) ? utc : `${ utc }Z` );
		if ( ! Number.isNaN( d.getTime() ) ) {
			return d;
		}
	}
	const local = post.modified ?? post.date;
	if ( local ) {
		const d = new Date( local );
		if ( ! Number.isNaN( d.getTime() ) ) {
			return d;
		}
	}
	return null;
}
