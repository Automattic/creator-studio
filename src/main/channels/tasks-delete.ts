import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

export const tasksDelete = defineChannel( {
	name: IpcChannels.tasksDelete,
	input: z.object( {
		projectId: z.string().min( 1 ),
		id: z.string().min( 1 ),
	} ),
	handle: ( { projectId, id } ) => ( {
		ok: getTaskManager().deleteDefinition( projectId, id ),
	} ),
} );
