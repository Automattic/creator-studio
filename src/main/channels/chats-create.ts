import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { createChat } from '../services/chat-create';
import { defineChannel } from './utils/define-channel';
import { ChatKind } from '../../types';

export const chatsCreate = defineChannel( {
	name: IpcChannels.chatsCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		kind: ChatKind.optional(),
		title: z.string().optional(),
	} ),
	handle: ( { projectId, kind, title } ) =>
		createChat( projectId, { kind, title } ),
} );
