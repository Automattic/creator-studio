import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { createProject } from '../services/project';
import { defineChannel } from './utils/define-channel';

const Input = z.object( {
	path: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );

export const projectsCreate = defineChannel( {
	name: IpcChannels.projectsCreate,
	input: Input,
	handle: ( input ) => createProject( input ),
} );
