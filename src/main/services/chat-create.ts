import { randomUUID } from 'node:crypto';

import { resolveProjectPath, touchMeta } from './utils/chat-store';
import type { ChatKind, ChatMeta } from '../../types';

export function createChat(
	projectId: string,
	options: { kind?: ChatKind; title?: string } = {}
): ChatMeta | null {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	const chatId = randomUUID();
	return touchMeta( projectPath, chatId, {
		kind: options.kind ?? 'general',
		title: options.title,
	} );
}
