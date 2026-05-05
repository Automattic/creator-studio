import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { isProjectChat, readMetaFile } from './utils/chat-store';
import { listProjects } from './utils/projects-list';
import { IpcChannels } from '.';
import type { RecentChat } from '../../types';

// Flat list of every chat across every linked project, newest activity first.
// Only includes chats the user has actually sent into (lastMessageAt set).
// Draft-editor chats are excluded — they live in the draft's own sidebar.
export const chatsRecent = defineChannel( {
	name: IpcChannels.chatsRecent,
	input: z.void(),
	handle: () => {
		const out: RecentChat[] = [];
		for ( const project of listProjects() ) {
			const meta = readMetaFile( project.path );
			for ( const chat of meta.chats ) {
				if ( chat.lastMessageAt === null ) {
					continue;
				}
				if ( ! isProjectChat( chat ) ) {
					continue;
				}
				out.push( {
					projectId: project.id,
					projectName: project.name,
					chat,
				} );
			}
		}
		out.sort(
			( a, b ) =>
				( b.chat.lastMessageAt ?? 0 ) - ( a.chat.lastMessageAt ?? 0 )
		);
		return out;
	},
} );
