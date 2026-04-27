import { z } from 'zod';

import { IpcChannels } from '..';
import { createFolder } from '../../services/folder';
import { defineChannel } from './utils/define-channel';

const Input = z.object( {
	path: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );

export const foldersCreate = defineChannel( {
	name: IpcChannels.foldersCreate,
	input: Input,
	handle: ( input ) => createFolder( input ),
} );
