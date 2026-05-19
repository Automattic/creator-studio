import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readStore, writeStore } from './utils/project-store';
import { IpcChannels } from '.';
import type { Project } from '../../types';

const Input = z.object( {
	id: z.string().min( 1 ),
	name: z.string().min( 1 ).optional(),
	goal: z.string().optional(),
} );

export const projectUpdate = defineChannel( {
	name: IpcChannels.projectUpdate,
	input: Input,
	handle: ( input ): Project | null => {
		const store = readStore();
		const project = store.projects.find( ( p ) => p.id === input.id );
		if ( ! project ) {
			return null;
		}
		if ( input.name !== undefined ) {
			project.name = input.name;
		}
		if ( input.goal !== undefined ) {
			project.goal = input.goal || undefined;
		}
		writeStore( store );
		return project;
	},
} );
