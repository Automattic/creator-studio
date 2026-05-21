/**
 * Auth pre-flight shared by the chat agent (`AgentService`) and the headless
 * task runner. Refuses to start the SDK when we already know auth will fail —
 * a missing API key, or a signed-out Claude Code session — so the caller can
 * surface an actionable error instead of a cryptic SDK failure.
 */
import { getCachedClaudeAuthStatus } from './claude-auth-status';
import { readStore } from './ui-prefs-store';

export type AuthPreflightError = {
	message: string;
	code?: 'invalid_api_key' | 'claude_code_signed_out';
};

// Returns null when auth is ready, or an error describing why it is not.
export function checkAgentAuthReady(): AuthPreflightError | null {
	const authMode = readStore().authMode ?? 'api-key';
	if ( authMode === 'api-key' ) {
		if ( ! process.env.ANTHROPIC_API_KEY ) {
			return { message: 'ANTHROPIC_API_KEY is not set' };
		}
		return null;
	}
	// OAuth: the cache is warmed at app startup and by the Settings modal; a
	// cold miss reads as signed-out and routes the user to Settings, where
	// Refresh will warm it.
	const status = getCachedClaudeAuthStatus();
	if ( ! status.signedIn ) {
		return {
			message:
				'You are signed out of Claude Code. Open Settings to sign in.',
			code: 'claude_code_signed_out',
		};
	}
	return null;
}
