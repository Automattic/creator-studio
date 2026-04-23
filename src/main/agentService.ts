import { app, type WebContents } from 'electron';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import fs from 'node:fs';
import path from 'node:path';

import { IpcChannels, type AgentEvent } from './ipc';

const READ_ONLY_TOOLS = [ 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch' ];
const BLOCKED_TOOLS = [ 'Bash', 'Write', 'Edit', 'NotebookEdit', 'MultiEdit' ];

function resolveClaudeCodeBinary(): string {
	// Packaged (via extraResource in forge.config.ts): the binary's package
	// directory is copied verbatim into Contents/Resources.
	// Dev: the optional dep lives under the source tree's node_modules.
	const pkgDir = `claude-agent-sdk-${ process.platform }-${ process.arch }`;
	const packaged = path.join( process.resourcesPath, pkgDir, 'claude' );
	const dev = path.join(
		app.getAppPath(),
		'node_modules',
		'@anthropic-ai',
		pkgDir,
		'claude'
	);
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error( `Claude Code binary not found at ${ candidate }` );
	}
	fs.accessSync( candidate, fs.constants.X_OK );
	return candidate;
}

export class AgentService {
	private sessionId: string | null = null;
	private binaryPath: string;

	constructor( private webContents: WebContents ) {
		this.binaryPath = resolveClaudeCodeBinary();
	}

	async send( prompt: string ): Promise< void > {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			this.emit( {
				kind: 'error',
				message: 'ANTHROPIC_API_KEY is not set',
			} );
			this.emit( { kind: 'done', success: false } );
			return;
		}

		const q = query( {
			prompt,
			options: {
				cwd: app.getPath( 'userData' ),
				env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
				pathToClaudeCodeExecutable: this.binaryPath,
				allowedTools: READ_ONLY_TOOLS,
				disallowedTools: BLOCKED_TOOLS,
				includePartialMessages: true,
				resume: this.sessionId ?? undefined,
				settingSources: [],
			},
		} );

		try {
			for await ( const msg of q ) {
				this.handleMessage( msg );
			}
		} catch ( err ) {
			this.emit( {
				kind: 'error',
				message: err instanceof Error ? err.message : String( err ),
			} );
			this.emit( { kind: 'done', success: false } );
		}
	}

	private handleMessage( msg: SDKMessage ): void {
		switch ( msg.type ) {
			case 'system':
				if ( msg.subtype === 'init' ) {
					this.sessionId = msg.session_id;
					this.emit( { kind: 'init', sessionId: msg.session_id } );
				}
				return;

			case 'stream_event': {
				const ev = msg.event;
				if (
					ev.type === 'content_block_delta' &&
					ev.delta.type === 'text_delta'
				) {
					this.emit( { kind: 'text-delta', text: ev.delta.text } );
				} else if (
					ev.type === 'content_block_start' &&
					ev.content_block.type === 'tool_use'
				) {
					this.emit( {
						kind: 'tool-use',
						toolName: ev.content_block.name,
					} );
				}
				return;
			}

			case 'result':
				this.emit( {
					kind: 'done',
					success: msg.subtype === 'success',
				} );
		}
	}

	private emit( event: AgentEvent ): void {
		if ( this.webContents.isDestroyed() ) {
			return;
		}
		this.webContents.send( IpcChannels.event, event );
	}
}
