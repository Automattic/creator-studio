import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';
import { TaskSchedule } from '../../types';

export const tasksUpdate = defineChannel( {
	name: IpcChannels.tasksUpdate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		id: z.string().min( 1 ),
		patch: z.object( {
			title: z.string().min( 1 ).optional(),
			description: z.string().optional(),
			instructions: z.string().min( 1 ).optional(),
			schedule: TaskSchedule.optional(),
			enabled: z.boolean().optional(),
		} ),
	} ),
	handle: ( { projectId, id, patch } ) =>
		getTaskManager().updateDefinition( projectId, id, patch ),
} );
