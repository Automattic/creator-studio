import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { listConnections } from './utils/wordpress-store';
import { IpcChannels } from '.';
import type { WordpressConnectionPublic } from '../../types';

export const wordpressList = defineChannel( {
	name: IpcChannels.wordpressList,
	input: z.object( {} ).optional(),
	handle: (): WordpressConnectionPublic[] => listConnections(),
} );
