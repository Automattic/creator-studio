import fs from 'node:fs';

import { chatLogPath, resolveProjectPath } from './utilities/chat-store';
import type { PersistedMessage } from '../../types';

export function loadChat(
	projectId: string,
	chatId: string
): PersistedMessage[] {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return [];
	}
	const logPath = chatLogPath( projectPath, chatId );
	if ( ! fs.existsSync( logPath ) ) {
		return [];
	}
	const raw = fs.readFileSync( logPath, 'utf-8' );
	const lines = raw.split( /\r?\n/ ).filter( ( line ) => line.length > 0 );
	const messages: PersistedMessage[] = [];
	for ( const line of lines ) {
		try {
			messages.push( JSON.parse( line ) as PersistedMessage );
		} catch {
			// Skip malformed line; keep going.
		}
	}
	return messages;
}
