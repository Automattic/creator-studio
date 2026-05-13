import { refreshClaudeAuthStatus } from './claude-auth-status';
import { readStore, writeStore } from './ui-prefs-store';

// Startup auth bootstrap. Two jobs:
//
// 1. First-launch resolver. If `authMode` isn't set in ui-prefs.json yet,
//    probe `claude auth status` and write 'claude-code' (signed in) or
//    'api-key' (signed out). A user who installed Claude Code and signed
//    in *before* opening Studio Write gets OAuth as the default without
//    a Settings round-trip. Once a mode lands in the store, subsequent
//    launches don't re-decide — an explicit toggle isn't overridden by a
//    future probe.
//
// 2. Cache warm-up for OAuth mode. Whether the mode was just resolved
//    or was already persisted, in claude-code mode we need
//    `getCachedClaudeAuthStatus()` to return the real signed-in state
//    before the first agent send or draft check runs. Without this, the
//    cold cache reads as signed-out and every pre-flight check fails
//    until the user opens Settings (which fires `auth:statusRefresh`).
export async function resolveInitialAuthMode(): Promise< void > {
	const current = readStore().authMode;
	if ( ! current ) {
		const status = await refreshClaudeAuthStatus();
		writeStore( {
			authMode: status.signedIn ? 'claude-code' : 'api-key',
		} );
		return;
	}
	if ( current === 'claude-code' ) {
		await refreshClaudeAuthStatus();
	}
}
