import {
	readMetaFile,
	resolveProjectPath,
	touchMeta,
} from './utils/chat-store';

export { DEFAULT_CHAT_ID } from './utils/chat-store';

export function getSessionId(
	projectId: string,
	chatId: string
): string | null {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	const meta = readMetaFile( projectPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.sessionId ?? null;
}

export function setSessionId(
	projectId: string,
	chatId: string,
	sessionId: string
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	touchMeta( projectPath, chatId, { sessionId } );
}
