import { decryptSecret } from './wordpress-store';
import type { WordpressConnection } from '../../../types';

// Discriminated result of any WP REST call. We deliberately surface
// `unauthorized` and `unreachable` as separate cases so the renderer
// can render targeted copy ("check your app password" vs "site
// unreachable") without parsing error messages.
export type WordpressFetchResult< T > =
	| { ok: true; data: T; status: number }
	| {
			ok: false;
			reason:
				| 'unauthorized'
				| 'forbidden'
				| 'not-found'
				| 'rest-disabled'
				| 'network'
				| 'http-error'
				| 'parse-error';
			status?: number;
			message?: string;
	  };

// Strips trailing slashes and forces https:// when no scheme is
// present. We keep the host casing as-typed; WP doesn't care.
export function normalizeSiteUrl( raw: string ): string {
	const trimmed = raw.trim();
	if ( trimmed.length === 0 ) {
		return '';
	}
	const withScheme = /^https?:\/\//i.test( trimmed )
		? trimmed
		: `https://${ trimmed }`;
	return withScheme.replace( /\/+$/, '' );
}

function buildSelfHostedUrl( siteUrl: string, apiPath: string ): string {
	const cleanPath = apiPath.replace( /^\/+/, '' );
	return `${ siteUrl }/wp-json/${ cleanPath }`;
}

function buildWpcomUrl( blogId: number, apiPath: string ): string {
	const cleanPath = apiPath.replace( /^\/+/, '' );
	// wp.com mirrors the wp/v2 namespace under /wp/v2/sites/<blogId>/...
	// for any path that would normally hit /wp-json/wp/v2/... on the
	// source site. Top-level paths (the bare `/` index) get the same
	// site-scoped prefix so callers can pass `''` to ping the site.
	const prefixed = cleanPath.startsWith( 'wp/v2/' )
		? cleanPath.replace( /^wp\/v2\//, '' )
		: cleanPath;
	return `https://public-api.wordpress.com/wp/v2/sites/${ blogId }/${ prefixed }`;
}

export function buildAuthHeader( connection: WordpressConnection ): string {
	const secret = decryptSecret( connection.secretCipher );
	if ( connection.kind === 'app-password' ) {
		const username = connection.username ?? '';
		const token = Buffer.from( `${ username }:${ secret }` ).toString(
			'base64'
		);
		return `Basic ${ token }`;
	}
	return `Bearer ${ secret }`;
}

export async function wpFetch< T = unknown >(
	connection: WordpressConnection,
	apiPath: string,
	init: RequestInit = {}
): Promise< WordpressFetchResult< T > > {
	const url =
		connection.kind === 'wpcom-oauth'
			? buildWpcomUrl( connection.wpcomBlogId ?? 0, apiPath )
			: buildSelfHostedUrl( connection.siteUrl, apiPath );

	const headers = new Headers( init.headers ?? {} );
	headers.set( 'Authorization', buildAuthHeader( connection ) );
	headers.set( 'Accept', 'application/json' );
	if ( init.body && ! headers.has( 'Content-Type' ) ) {
		headers.set( 'Content-Type', 'application/json' );
	}

	let response: Response;
	try {
		response = await fetch( url, { ...init, headers } );
	} catch ( err ) {
		return {
			ok: false,
			reason: 'network',
			message: err instanceof Error ? err.message : String( err ),
		};
	}

	if ( response.status === 401 ) {
		return { ok: false, reason: 'unauthorized', status: 401 };
	}
	if ( response.status === 403 ) {
		return { ok: false, reason: 'forbidden', status: 403 };
	}
	if ( response.status === 404 ) {
		const text = await response.text().catch( () => '' );
		const looksLikeRestDisabled = /rest_no_route|rest_disabled/i.test(
			text
		);
		return {
			ok: false,
			reason: looksLikeRestDisabled ? 'rest-disabled' : 'not-found',
			status: 404,
			message: text.slice( 0, 240 ),
		};
	}
	if ( ! response.ok ) {
		const text = await response.text().catch( () => '' );
		return {
			ok: false,
			reason: 'http-error',
			status: response.status,
			message: text.slice( 0, 240 ),
		};
	}

	try {
		const data = ( await response.json() ) as T;
		return { ok: true, data, status: response.status };
	} catch ( err ) {
		return {
			ok: false,
			reason: 'parse-error',
			status: response.status,
			message: err instanceof Error ? err.message : String( err ),
		};
	}
}

// Convenience: verify a connection by calling /users/me?context=edit.
// Returns the user record on success (we use `name` to seed a default
// connection label) so callers don't need a second round-trip.
export type WpUser = {
	id: number;
	name: string;
	slug: string;
	url?: string;
	link?: string;
};

export async function verifyConnection(
	connection: WordpressConnection
): Promise< WordpressFetchResult< WpUser > > {
	return wpFetch< WpUser >( connection, 'wp/v2/users/me?context=edit' );
}

// Convenience: fetch the site's display info (used to set a nice
// default label when the user hasn't typed one). Self-hosted: hits
// /wp-json/. wp.com: hits /wp/v2/sites/<blogId>.
export type WpSiteInfo = {
	name?: string;
	description?: string;
	url?: string;
	home?: string;
};

export async function getSiteInfo(
	connection: WordpressConnection
): Promise< WordpressFetchResult< WpSiteInfo > > {
	if ( connection.kind === 'wpcom-oauth' ) {
		return wpFetch< WpSiteInfo >( connection, '' );
	}
	return wpFetch< WpSiteInfo >( connection, '' );
}
