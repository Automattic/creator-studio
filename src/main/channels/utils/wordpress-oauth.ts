import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { BrowserWindow, app, shell } from 'electron';

const WPCOM_AUTHORIZE_URL = 'https://public-api.wordpress.com/oauth2/authorize';
const WPCOM_TOKEN_URL = 'https://public-api.wordpress.com/oauth2/token';
// Minimal site info we read back from /rest/v1.1/me/sites — used to
// label the connection and to remember the blog id so REST calls can
// hit /wp/v2/sites/<blogId>/...
const WPCOM_ME_SITES_URL =
	'https://public-api.wordpress.com/rest/v1.1/me/sites?fields=ID,name,URL';
// The OAuth'd user themselves. Numeric ID is the grouping key we
// stamp on every connection so the settings UI can collapse all of
// an account's sites under one header.
const WPCOM_ME_URL =
	'https://public-api.wordpress.com/rest/v1.1/me?fields=ID,username';

// Public client_id of the Studio Write app registered on
// developer.wordpress.com. With PKCE there is no client_secret to
// protect — shipping the id in the bundle is the standard pattern
// for native OAuth apps. `WPCOM_CLIENT_ID` env var overrides at
// runtime so devs can test against their own registered app.
const DEFAULT_WPCOM_CLIENT_ID = '139728';

// Ports we may bind the loopback HTTP server on. Must exactly match
// the redirect URLs registered on the WP.com OAuth app, so we can't
// pick a random port. We try them in order and bind to the first one
// that's free. Keep this list in sync with the app's registered
// redirect URLs (http://127.0.0.1:<PORT>/callback for each entry).
const LOOPBACK_PORTS = [ 53682, 53683, 53684 ];

// Backstop for an abandoned flow — the user clicks "Sign in," then
// closes the browser tab and walks away. Without this the loopback
// server stays bound to its port until the app quits. Mirrors the
// explicit IPC cancel path so they share one cleanup branch.
const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

export type OauthSite = {
	blogId: number;
	blogUrl: string;
	blogName: string;
};

export type OauthAccount = {
	userId: number;
	username: string;
};

export type OauthTokenResult = {
	accessToken: string;
	// The authenticating user. Null when /me failed (soft-fail) — the
	// connect handler then stamps sites without account info and they
	// render flat, same as legacy records.
	account: OauthAccount | null;
	// Every site the OAuth token grants access to. Always at least
	// one — see the `no-site` error otherwise. WordPress.com OAuth
	// with scope=global lets a single token serve every blog the
	// account owns / is a member of, so we surface them all and let
	// the connect handler create one connection per site.
	sites: OauthSite[];
};

export type OauthError =
	| { kind: 'missing-client-id' }
	| { kind: 'user-cancelled' }
	| { kind: 'state-mismatch' }
	| { kind: 'token-exchange-failed'; status?: number; body?: string }
	| { kind: 'no-site'; message: string }
	| { kind: 'network'; message: string };

function base64url( buf: Buffer ): string {
	return buf
		.toString( 'base64' )
		.replace( /\+/g, '-' )
		.replace( /\//g, '_' )
		.replace( /=+$/, '' );
}

function generateVerifier(): string {
	return base64url( randomBytes( 32 ) );
}

function generateChallenge( verifier: string ): string {
	return base64url( createHash( 'sha256' ).update( verifier ).digest() );
}

function generateState(): string {
	return base64url( randomBytes( 32 ) );
}

// Equal-length constant-time compare. timingSafeEqual throws on
// length mismatch, so we guard first and reject mismatched lengths
// directly (they cannot match anyway).
function constantTimeEqual( a: string, b: string ): boolean {
	const ab = Buffer.from( a, 'utf8' );
	const bb = Buffer.from( b, 'utf8' );
	if ( ab.length !== bb.length ) {
		return false;
	}
	return timingSafeEqual( ab, bb );
}

// Finds the first port in LOOPBACK_PORTS that nothing else is
// holding. Returns null if every candidate is taken — exceedingly
// rare in practice, and at that point the user has bigger problems
// than our OAuth flow.
function pickAvailablePort(): Promise< number | null > {
	return new Promise( ( resolve ) => {
		const tryNext = ( idx: number ): void => {
			if ( idx >= LOOPBACK_PORTS.length ) {
				resolve( null );
				return;
			}
			const port = LOOPBACK_PORTS[ idx ];
			const probe = http.createServer();
			probe.unref();
			probe.once( 'error', () => tryNext( idx + 1 ) );
			probe.listen( port, '127.0.0.1', () => {
				probe.close( () => resolve( port ) );
			} );
		};
		tryNext( 0 );
	} );
}

export function getClientId(): string | null {
	const override = process.env.WPCOM_CLIENT_ID?.trim();
	if ( override && override.length > 0 ) {
		return override;
	}
	return DEFAULT_WPCOM_CLIENT_ID;
}

// Brings the app window to the foreground when the system browser
// hands the callback back to us. Without this, focus stays on the
// browser and the user has to alt-tab manually.
function focusMainWindow(): void {
	const target = BrowserWindow.getAllWindows().find(
		( w ) => ! w.isDestroyed()
	);
	target?.show();
	target?.focus();
	if ( process.platform === 'darwin' ) {
		app.focus( { steal: true } );
	}
}

function renderSuccessPage(): string {
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>Studio Write</title>
<meta name="color-scheme" content="light dark">
<style>
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
       margin: 0; min-height: 100vh; display: grid; place-items: center;
       background: Canvas; color: CanvasText; }
.card { max-width: 420px; padding: 40px 32px; text-align: center; }
h1 { font-size: 22px; margin: 0 0 12px; font-weight: 600; }
p { font-size: 15px; line-height: 1.5; margin: 0 0 8px; opacity: 0.8; }
.hint { margin-top: 24px; font-size: 13px; opacity: 0.55; }
</style></head>
<body><div class="card">
<h1>You're signed in</h1>
<p>Studio Write has received your WordPress.com authorisation.</p>
<p class="hint">You can close this tab and return to Studio Write.</p>
</div></body></html>`;
}

function renderErrorPage( reason: string ): string {
	const safeReason = String( reason ).replace( /[<>&"]/g, ( c ) => {
		switch ( c ) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case '"':
				return '&quot;';
			default:
				return c;
		}
	} );
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>Studio Write</title>
<meta name="color-scheme" content="light dark">
<style>
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
       margin: 0; min-height: 100vh; display: grid; place-items: center;
       background: Canvas; color: CanvasText; }
.card { max-width: 420px; padding: 40px 32px; text-align: center; }
h1 { font-size: 22px; margin: 0 0 12px; font-weight: 600; color: #d33; }
p { font-size: 15px; line-height: 1.5; margin: 0 0 8px; opacity: 0.8; }
.hint { margin-top: 24px; font-size: 13px; opacity: 0.55; }
</style></head>
<body><div class="card err">
<h1>Sign-in failed</h1>
<p>${ safeReason }</p>
<p class="hint">You can close this tab and return to Studio Write to try again.</p>
</div></body></html>`;
}

// Drives the full PKCE authorization-code flow. Opens the user's
// default browser at the WP.com authorize URL, then waits on a
// loopback HTTP server for the redirect. Blocks until the user
// completes the browser flow, the caller aborts (signal), or the
// 5-minute backstop fires. On success the loopback server is shut
// down and the returned token has been verified against /me/sites.
export async function runOauthFlow( {
	signal,
}: {
	signal: AbortSignal;
} ): Promise<
	{ ok: true; data: OauthTokenResult } | { ok: false; error: OauthError }
> {
	const clientId = getClientId();
	if ( ! clientId ) {
		return { ok: false, error: { kind: 'missing-client-id' } };
	}

	const port = await pickAvailablePort();
	if ( port === null ) {
		return {
			ok: false,
			error: {
				kind: 'network',
				message: `All loopback ports busy (${ LOOPBACK_PORTS.join(
					', '
				) }). Close the app(s) using them and try again.`,
			},
		};
	}
	const verifier = generateVerifier();
	const challenge = generateChallenge( verifier );
	const state = generateState();
	const redirectUri = `http://127.0.0.1:${ port }/callback`;

	const authUrl = new URL( WPCOM_AUTHORIZE_URL );
	authUrl.searchParams.set( 'response_type', 'code' );
	authUrl.searchParams.set( 'client_id', clientId );
	authUrl.searchParams.set( 'redirect_uri', redirectUri );
	authUrl.searchParams.set( 'scope', 'global' );
	authUrl.searchParams.set( 'code_challenge', challenge );
	authUrl.searchParams.set( 'code_challenge_method', 'S256' );
	authUrl.searchParams.set( 'state', state );

	// Funnel external cancel + timeout into one controller so the
	// downstream race + fetch() calls only have to watch one signal.
	const controller = new AbortController();
	const onParentAbort = (): void => controller.abort();
	if ( signal.aborted ) {
		controller.abort();
	} else {
		signal.addEventListener( 'abort', onParentAbort );
	}
	const timeoutHandle = setTimeout(
		() => controller.abort(),
		FLOW_TIMEOUT_MS
	);

	const cleanup = (): void => {
		clearTimeout( timeoutHandle );
		signal.removeEventListener( 'abort', onParentAbort );
	};

	// Loopback server waits for the redirect. We resolve `codePromise`
	// with the captured code (or an error) and shut the server down
	// regardless of outcome via the cleanup path at the end.
	const server = http.createServer();
	const codePromise = new Promise<
		| { ok: true; code: string }
		| { ok: false; reason: 'state-mismatch' | string }
	>( ( resolve ) => {
		server.on( 'request', ( req, res ) => {
			try {
				const reqUrl = new URL(
					req.url ?? '/',
					`http://127.0.0.1:${ port }`
				);
				if ( reqUrl.pathname !== '/callback' ) {
					res.statusCode = 404;
					res.end( 'not found' );
					return;
				}
				const code = reqUrl.searchParams.get( 'code' );
				const error = reqUrl.searchParams.get( 'error' );
				const returnedState = reqUrl.searchParams.get( 'state' ) ?? '';

				if ( ! constantTimeEqual( returnedState, state ) ) {
					res.statusCode = 400;
					res.setHeader( 'Content-Type', 'text/html' );
					res.end(
						renderErrorPage(
							"This callback didn't match the sign-in Studio Write started. For your security, the request was rejected."
						)
					);
					resolve( { ok: false, reason: 'state-mismatch' } );
					return;
				}

				if ( error || ! code ) {
					res.statusCode = 400;
					res.setHeader( 'Content-Type', 'text/html' );
					res.end(
						renderErrorPage(
							error
								? `WordPress.com reported: ${ error }`
								: 'WordPress.com did not return an authorisation code.'
						)
					);
					resolve( { ok: false, reason: error ?? 'no-code' } );
					return;
				}
				res.statusCode = 200;
				res.setHeader( 'Content-Type', 'text/html' );
				res.end( renderSuccessPage() );
				focusMainWindow();
				resolve( { ok: true, code } );
			} catch ( err ) {
				res.statusCode = 500;
				res.end( 'error' );
				resolve( {
					ok: false,
					reason:
						err instanceof Error ? err.message : 'callback-error',
				} );
			}
		} );
		server.listen( port, '127.0.0.1' );
	} );

	try {
		await shell.openExternal( authUrl.toString() );
	} catch ( err ) {
		cleanup();
		server.close();
		return {
			ok: false,
			error: {
				kind: 'network',
				message: err instanceof Error ? err.message : String( err ),
			},
		};
	}

	const abortPromise = new Promise< { ok: false; reason: string } >(
		( resolve ) => {
			if ( controller.signal.aborted ) {
				resolve( { ok: false, reason: 'user-cancelled' } );
				return;
			}
			controller.signal.addEventListener( 'abort', () =>
				resolve( { ok: false, reason: 'user-cancelled' } )
			);
		}
	);

	const captured = await Promise.race( [ codePromise, abortPromise ] );

	server.closeAllConnections?.();
	server.close();

	if ( captured.ok === false ) {
		cleanup();
		if ( captured.reason === 'user-cancelled' ) {
			return { ok: false, error: { kind: 'user-cancelled' } };
		}
		if ( captured.reason === 'state-mismatch' ) {
			return { ok: false, error: { kind: 'state-mismatch' } };
		}
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				body: captured.reason,
			},
		};
	}

	// Exchange the code for a token. WP.com expects
	// `application/x-www-form-urlencoded` here, not JSON.
	const tokenBody = new URLSearchParams( {
		grant_type: 'authorization_code',
		code: captured.code,
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: verifier,
	} );

	let tokenResp: Response;
	try {
		tokenResp = await fetch( WPCOM_TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: tokenBody.toString(),
			signal: controller.signal,
		} );
	} catch ( err ) {
		cleanup();
		if ( controller.signal.aborted ) {
			return { ok: false, error: { kind: 'user-cancelled' } };
		}
		return {
			ok: false,
			error: {
				kind: 'network',
				message: err instanceof Error ? err.message : String( err ),
			},
		};
	}

	if ( ! tokenResp.ok ) {
		const text = await tokenResp.text().catch( () => '' );
		cleanup();
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				status: tokenResp.status,
				body: text.slice( 0, 240 ),
			},
		};
	}

	const tokenData = ( await tokenResp.json().catch( () => null ) ) as {
		access_token?: string;
		blog_id?: number | string;
		blog_url?: string;
	} | null;
	if ( ! tokenData?.access_token ) {
		cleanup();
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				status: tokenResp.status,
				body: 'no access_token in response',
			},
		};
	}

	// Fetch every site this token grants access to. WP.com OAuth with
	// scope=global typically returns several entries for an account
	// that owns more than one blog. The token-time `blog_id` (only
	// set when a single-blog scope was used) is added as a fallback
	// so we always end up with at least one site when the listing
	// endpoint is empty / unreachable.
	const sites: OauthSite[] = [];
	try {
		const sitesResp = await fetch( WPCOM_ME_SITES_URL, {
			headers: {
				Authorization: `Bearer ${ tokenData.access_token }`,
				Accept: 'application/json',
			},
			signal: controller.signal,
		} );
		if ( sitesResp.ok ) {
			const sitesData = ( await sitesResp.json() ) as {
				sites?: Array< { ID: number; name: string; URL: string } >;
			};
			for ( const site of sitesData.sites ?? [] ) {
				if ( ! site || typeof site.ID !== 'number' ) {
					continue;
				}
				sites.push( {
					blogId: site.ID,
					blogUrl: site.URL ?? '',
					blogName: site.name || site.URL || `Site ${ site.ID }`,
				} );
			}
		}
	} catch {
		// Best-effort listing — soft-fail.
	}

	if ( sites.length === 0 ) {
		const fallbackId = Number( tokenData.blog_id ?? 0 );
		if ( fallbackId > 0 ) {
			const url = tokenData.blog_url ?? '';
			sites.push( {
				blogId: fallbackId,
				blogUrl: url || `https://wordpress.com/blog/${ fallbackId }`,
				blogName: url || `Site ${ fallbackId }`,
			} );
		}
	}

	if ( sites.length === 0 ) {
		cleanup();
		return {
			ok: false,
			error: {
				kind: 'no-site',
				message:
					"Couldn't determine which blogs this token belongs to.",
			},
		};
	}

	// Best-effort account lookup. A failure here means sites end up
	// ungrouped in the UI but everything else still works, so we never
	// abort the OAuth flow over it.
	let account: OauthAccount | null = null;
	try {
		const meResp = await fetch( WPCOM_ME_URL, {
			headers: {
				Authorization: `Bearer ${ tokenData.access_token }`,
				Accept: 'application/json',
			},
			signal: controller.signal,
		} );
		if ( meResp.ok ) {
			const meData = ( await meResp.json() ) as {
				ID?: number;
				username?: string;
			};
			if (
				typeof meData.ID === 'number' &&
				meData.ID > 0 &&
				typeof meData.username === 'string' &&
				meData.username.length > 0
			) {
				account = { userId: meData.ID, username: meData.username };
			}
		}
	} catch {
		// soft-fail
	}

	cleanup();
	return {
		ok: true,
		data: {
			accessToken: tokenData.access_token,
			account,
			sites,
		},
	};
}
