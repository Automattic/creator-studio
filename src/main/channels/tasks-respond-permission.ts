import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';
import { TaskPermissionResponse } from '../../types';

export const tasksRespondPermission = defineChannel( {
	name: IpcChannels.tasksRespondPermission,
	input: TaskPermissionResponse,
	handle: ( response ): void => {
		getTaskManager().respondPermission( response );
	},
} );
