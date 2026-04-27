import { z } from 'zod';

import { createChat } from '../services/chat-create';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';
import { ChatKind } from '../../types';

export const chatCreate = defineChannel( {
	name: IpcChannels.chatCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		kind: ChatKind.optional(),
		title: z.string().optional(),
	} ),
	handle: ( { projectId, kind, title } ) =>
		createChat( projectId, { kind, title } ),
} );
