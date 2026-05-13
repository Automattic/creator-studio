import { refreshClaudeAuthStatus } from './claude-auth-status';
import { readStore, writeStore } from './ui-prefs-store';

// First-launch resolver: if the user hasn't picked an auth mode yet,
// probe the bundled `claude` binary's auth status. A signed-in session
// means the user installed and logged into Claude Code before Studio
// Write — we default to OAuth so the very first message they send
// "just works" without a Settings round-trip. Otherwise we fall back
// to the API-key flow that existed before this feature.
//
// Once a mode lands in ui-prefs.json this function is a no-op on every
// subsequent launch, so users who explicitly toggled the radio aren't
// silently flipped back by a future probe result.
export async function resolveInitialAuthMode(): Promise< void > {
	const current = readStore().authMode;
	if ( current ) {
		return;
	}
	const status = await refreshClaudeAuthStatus();
	writeStore( { authMode: status.signedIn ? 'claude-code' : 'api-key' } );
}
