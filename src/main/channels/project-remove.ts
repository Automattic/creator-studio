import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readStore, writeStore } from './utils/project-store';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

export const projectRemove = defineChannel( {
	name: IpcChannels.projectRemove,
	input: z.object( {
		id: z.string().min( 1 ),
	} ),
	handle: ( { id } ) => {
		const store = readStore();
		store.projects = store.projects.filter( ( p ) => p.id !== id );
		writeStore( store );
		getTaskManager().removeProject( id );
	},
} );
