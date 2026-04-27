import fs from 'node:fs';
import path from 'node:path';

import {
	chatLogPath,
	ensureDir,
	resolveProjectPath,
	touchMeta,
} from './utils/chat-store';
import type { PersistedMessage } from '../../types';

export function appendMessage(
	projectId: string,
	chatId: string,
	message: PersistedMessage
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	const logPath = chatLogPath( projectPath, chatId );
	ensureDir( path.dirname( logPath ) );
	fs.appendFileSync( logPath, JSON.stringify( message ) + '\n', 'utf-8' );
	touchMeta( projectPath, chatId, { lastMessageAt: message.at } );
}
