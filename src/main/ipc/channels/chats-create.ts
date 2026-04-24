import { z } from 'zod';

import { ChatKind, IpcChannels } from '..';
import { createChat } from '../../services/chat';
import { defineChannel } from '../define-channel';

export const chatsCreate = defineChannel( {
	name: IpcChannels.chatsCreate,
	input: z.object( {
		folderId: z.string().min( 1 ),
		kind: ChatKind.optional(),
		title: z.string().optional(),
	} ),
	handle: ( { folderId, kind, title } ) =>
		createChat( folderId, { kind, title } ),
} );
