import fs from 'node:fs';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { chatLogPath, resolveProjectPath } from './utils/chat-store';
import { IpcChannels } from '.';
import type { PersistedMessage } from '../../types';

export const chatLoad = defineChannel( {
	name: IpcChannels.chatLoad,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, chatId } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return [];
		}
		const logPath = chatLogPath( projectPath, chatId );
		if ( ! fs.existsSync( logPath ) ) {
			return [];
		}
		const raw = fs.readFileSync( logPath, 'utf-8' );
		const lines = raw
			.split( /\r?\n/ )
			.filter( ( line ) => line.length > 0 );
		const messages: PersistedMessage[] = [];
		for ( const line of lines ) {
			try {
				messages.push( JSON.parse( line ) as PersistedMessage );
			} catch {
				// Skip malformed line; keep going.
			}
		}
		return messages;
	},
} );
