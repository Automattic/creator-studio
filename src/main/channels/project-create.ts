import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { createProject } from '../services/project-create';
import { defineChannel } from './utils/define-channel';

const Input = z.object( {
	path: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );

export const projectCreate = defineChannel( {
	name: IpcChannels.projectCreate,
	input: Input,
	handle: ( input ) => createProject( input ),
} );
