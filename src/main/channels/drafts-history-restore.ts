import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import {
	restoreSnapshot,
	type RestoreSnapshotResult,
} from './utils/draft-history';
import { IpcChannels } from '.';

export const draftsHistoryRestore = defineChannel( {
	name: IpcChannels.draftsHistoryRestore,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.enum( [ 'drafts', 'done', 'sources', 'checks' ] ),
		id: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath, folder, id } ): RestoreSnapshotResult => {
		return restoreSnapshot( projectId, folder, relPath, id );
	},
} );
