import path from 'node:path';

import { z } from 'zod';

import { checksOnFolderChanged } from './checks-on-folder-changed';
import { defineChannel } from './utils/define-channel';
import { subscribeFolder } from './utils/folder-watcher';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const CHECKS_FOLDER = 'checks';

export type ChecksWatchResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' };

export const checksWatch = defineChannel( {
	name: IpcChannels.checksWatch,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId }, event ): ChecksWatchResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const dir = path.resolve( project.path, CHECKS_FOLDER );
		const sender = event.sender;
		subscribeFolder( sender, dir, () => {
			checksOnFolderChanged.emit( sender, { projectId } );
		} );
		return { ok: true };
	},
} );
