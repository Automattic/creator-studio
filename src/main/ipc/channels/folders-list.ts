import { z } from 'zod';

import { IpcChannels } from '..';
import { listFolders } from '../../services/folder';
import { defineChannel } from './utils/define-channel';

export const foldersList = defineChannel( {
	name: IpcChannels.foldersList,
	input: z.void(),
	handle: () => listFolders(),
} );
