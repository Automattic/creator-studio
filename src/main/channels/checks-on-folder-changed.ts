import { z } from 'zod';

import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const ChecksFolderChanged = z.object( {
	projectId: z.string().min( 1 ),
} );
export type ChecksFolderChanged = z.infer< typeof ChecksFolderChanged >;

export const checksOnFolderChanged = defineEvent( {
	name: IpcChannels.checksOnFolderChanged,
	payload: ChecksFolderChanged,
} );
