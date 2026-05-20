import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readStore, writeStore } from './utils/project-store';
import { IpcChannels } from '.';

const Input = z.object( {
	id: z.string().min( 1 ),
} );

export const projectTouch = defineChannel( {
	name: IpcChannels.projectTouch,
	input: Input,
	handle: ( input ): { lastOpenedAt: number } | null => {
		const store = readStore();
		const project = store.projects.find( ( p ) => p.id === input.id );
		if ( ! project ) {
			return null;
		}
		const now = Date.now();
		project.lastOpenedAt = now;
		writeStore( store );
		return { lastOpenedAt: now };
	},
} );
