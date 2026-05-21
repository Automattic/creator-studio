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
		const project = store.projects.find( ( p ) => p.id === id );
		store.projects = store.projects.filter( ( p ) => p.id !== id );
		writeStore( store );
		if ( project ) {
			getTaskManager().removeProject( id, project.path );
		}
	},
} );
