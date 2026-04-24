import { z } from 'zod';

import { IpcChannels } from '..';
import { removeFolder } from '../../services/folder';
import { defineChannel } from '../define-channel';

export const foldersRemove = defineChannel( {
	name: IpcChannels.foldersRemove,
	input: z.object( {
		id: z.string().min( 1 ),
	} ),
	handle: ( { id } ) => removeFolder( id ),
} );
