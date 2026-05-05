import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import {
	isProjectChat,
	readMetaFile,
	resolveProjectPath,
} from './utils/chat-store';
import { IpcChannels } from '.';

export const chatsList = defineChannel( {
	name: IpcChannels.chatsList,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return [];
		}
		const meta = readMetaFile( projectPath );
		return meta.chats
			.filter( isProjectChat )
			.sort( ( a, b ) => a.createdAt - b.createdAt );
	},
} );
