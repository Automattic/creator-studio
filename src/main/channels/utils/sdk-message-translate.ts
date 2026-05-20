/**
 * Pure translators from the Claude Agent SDK's message shapes to this app's
 * domain shapes. Shared by `AgentService` (chat) and `TaskRunner` (tasks) so
 * the two never drift in how they read SDK output. No side effects — callers
 * own event emission and persistence.
 */
import type {
	SDKAssistantMessageError,
	SDKMessage,
	SDKResultError,
} from '@anthropic-ai/claude-agent-sdk';

export type AssistantParts = {
	// Joined text of every text block in the message ('' when there is none).
	text: string;
	toolUses: Array< {
		toolUseId: string;
		toolName: string;
		input: unknown;
	} >;
	// SDK turn-level failure flagged on the assistant message, or null.
	error: SDKAssistantMessageError | null;
};

export function extractAssistantParts(
	msg: Extract< SDKMessage, { type: 'assistant' } >
): AssistantParts {
	const textParts: string[] = [];
	const toolUses: AssistantParts[ 'toolUses' ] = [];
	for ( const block of msg.message.content ) {
		if ( block.type === 'tool_use' ) {
			toolUses.push( {
				toolUseId: block.id,
				toolName: block.name,
				input: block.input,
			} );
		} else if ( block.type === 'text' && typeof block.text === 'string' ) {
			textParts.push( block.text );
		}
	}
	return {
		text: textParts.join( '' ),
		toolUses,
		error: msg.error ?? null,
	};
}

export type ToolResultPart = {
	toolUseId: string;
	output: string;
	isError: boolean;
};

export function extractToolResults(
	msg: Extract< SDKMessage, { type: 'user' } >
): ToolResultPart[] {
	const content = msg.message.content;
	if ( ! Array.isArray( content ) ) {
		return [];
	}
	const out: ToolResultPart[] = [];
	for ( const block of content ) {
		if (
			typeof block === 'object' &&
			block !== null &&
			( block as { type?: string } ).type === 'tool_result'
		) {
			const typed = block as {
				tool_use_id: string;
				content?: string | Array< { type: string; text?: string } >;
				is_error?: boolean;
			};
			const output =
				typeof typed.content === 'string'
					? typed.content
					: ( typed.content ?? [] )
							.filter(
								( c ) =>
									c.type === 'text' &&
									typeof c.text === 'string'
							)
							.map( ( c ) => c.text as string )
							.join( '\n' );
			out.push( {
				toolUseId: typed.tool_use_id,
				output,
				isError: typed.is_error === true,
			} );
		}
	}
	return out;
}

export type ResultParts = {
	success: boolean;
	costUsd: number;
	tokens: number;
	durationMs: number;
	numTurns: number;
	// Human-readable failure detail when `success` is false; null otherwise.
	errorDetail: string | null;
};

export function extractResult(
	msg: Extract< SDKMessage, { type: 'result' } >
): ResultParts {
	const success = msg.subtype === 'success';
	let errorDetail: string | null = null;
	if ( ! success ) {
		// Result-error variants (error_during_execution etc.) carry the
		// underlying API errors in `errors[]`.
		const errors = ( msg as SDKResultError ).errors ?? [];
		errorDetail = errors.length > 0 ? errors.join( '; ' ) : msg.subtype;
	}
	return {
		success,
		costUsd: msg.total_cost_usd ?? 0,
		tokens:
			( msg.usage?.input_tokens ?? 0 ) +
			( msg.usage?.output_tokens ?? 0 ),
		durationMs: msg.duration_ms ?? 0,
		numTurns: msg.num_turns ?? 0,
		errorDetail,
	};
}

// A text delta from an SDK `stream_event`, or null for any other event.
export function extractTextDelta( raw: unknown ): string | null {
	const ev = raw as {
		type?: string;
		delta?: { type?: string; text?: string };
	};
	if (
		ev.type === 'content_block_delta' &&
		ev.delta?.type === 'text_delta' &&
		typeof ev.delta.text === 'string'
	) {
		return ev.delta.text;
	}
	return null;
}

// Map SDK-internal error codes to messages a user can act on. The SDK
// surfaces these on assistant messages (msg.error) when a turn fails; the
// most common in practice is `authentication_failed` (a bad API key, or a
// signed-out / expired Claude Code session).
export function describeAssistantError(
	error: SDKAssistantMessageError,
	authMode: 'api-key' | 'claude-code'
): string {
	switch ( error ) {
		case 'authentication_failed':
			return authMode === 'claude-code'
				? "Your Claude Code session can't be used. Open Settings to sign in again."
				: 'Invalid Anthropic API key. Open Settings to update it.';
		case 'billing_error':
			return 'Anthropic billing error. Check your account at console.anthropic.com.';
		case 'rate_limit':
			return 'Rate limit reached. Wait a moment and try again.';
		case 'invalid_request':
			return 'Anthropic rejected the request as invalid.';
		case 'server_error':
			return 'Anthropic server error. Try again in a moment.';
		case 'max_output_tokens':
			return 'The response hit the maximum token limit.';
		case 'unknown':
		default:
			return 'Anthropic returned an unexpected error.';
	}
}

// Renderer-facing error code for an assistant-level failure, or undefined
// when the failure isn't auth-related.
export function assistantErrorCode(
	error: SDKAssistantMessageError,
	authMode: 'api-key' | 'claude-code'
): 'invalid_api_key' | 'claude_code_signed_out' | undefined {
	if ( error === 'authentication_failed' ) {
		return authMode === 'claude-code'
			? 'claude_code_signed_out'
			: 'invalid_api_key';
	}
	return undefined;
}
