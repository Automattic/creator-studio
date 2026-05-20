/**
 * Shared HTTP helper for the task capability tools. Sets a desktop-browser
 * User-Agent (Reddit and GitHub reject the default agent; some sites block
 * obvious bots), enforces a timeout, follows redirects, and caps the body so a
 * huge page can't blow the model's context window.
 */

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 StudioWrite/1.0';

const DEFAULT_TIMEOUT_MS = 20_000;
// Character cap, not bytes — `String.length`. Roughly bounds tokens fed back
// to the model.
const MAX_BODY_CHARS = 150_000;

export type HttpResult = {
	ok: boolean;
	status: number;
	contentType: string;
	body: string;
	truncated: boolean;
};

export async function httpGet(
	url: string,
	opts: {
		accept?: string;
		headers?: Record< string, string >;
		timeoutMs?: number;
	} = {}
): Promise< HttpResult > {
	const res = await fetch( url, {
		method: 'GET',
		redirect: 'follow',
		headers: {
			'User-Agent': USER_AGENT,
			Accept: opts.accept ?? '*/*',
			...opts.headers,
		},
		signal: AbortSignal.timeout( opts.timeoutMs ?? DEFAULT_TIMEOUT_MS ),
	} );
	const full = await res.text();
	const truncated = full.length > MAX_BODY_CHARS;
	return {
		ok: res.ok,
		status: res.status,
		contentType: res.headers.get( 'content-type' ) ?? '',
		body: truncated ? full.slice( 0, MAX_BODY_CHARS ) : full,
		truncated,
	};
}

export function errMessage( err: unknown ): string {
	if ( err instanceof Error ) {
		// AbortSignal.timeout surfaces as a TimeoutError DOMException.
		if ( err.name === 'TimeoutError' ) {
			return 'the request timed out';
		}
		return err.message;
	}
	return String( err );
}
