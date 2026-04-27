import { readMetaFile, resolveProjectPath } from './utilities/chat-store';
import type { ChatMeta } from '../../types';

export function listChats( projectId: string ): ChatMeta[] {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return [];
	}
	const meta = readMetaFile( projectPath );
	return [ ...meta.chats ].sort( ( a, b ) => a.createdAt - b.createdAt );
}
