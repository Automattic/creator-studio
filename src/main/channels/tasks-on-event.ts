import { TasksEvent } from '../../types';
import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const tasksOnEvent = defineEvent( {
	name: IpcChannels.tasksOnEvent,
	payload: TasksEvent,
} );
