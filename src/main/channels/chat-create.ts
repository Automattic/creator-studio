import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { resolveProjectPath, touchMeta } from './utils/chat-store';
import { IpcChannels } from '.';
import { ChatKind } from '../../types';

export const chatCreate = defineChannel( {
	name: IpcChannels.chatCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		kind: ChatKind.optional(),
		title: z.string().optional(),
	} ),
	handle: ( { projectId, kind, title } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return null;
		}
		return touchMeta( projectPath, randomUUID(), {
			kind: kind ?? 'general',
			title,
		} );
	},
} );
