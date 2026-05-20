import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';
import { TaskSchedule } from '../../types';

export const tasksCreate = defineChannel( {
	name: IpcChannels.tasksCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		title: z.string().min( 1 ),
		description: z.string().optional(),
		instructions: z.string().min( 1 ),
		schedule: TaskSchedule,
	} ),
	handle: ( { projectId, title, description, instructions, schedule } ) =>
		getTaskManager().createDefinition( projectId, {
			title,
			description,
			instructions,
			schedule,
		} ),
} );
