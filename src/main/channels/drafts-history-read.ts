import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readSnapshot, type ReadSnapshotResult } from './utils/draft-history';
import { IpcChannels } from '.';

export const draftsHistoryRead = defineChannel( {
	name: IpcChannels.draftsHistoryRead,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.enum( [ 'drafts', 'done', 'sources', 'checks' ] ),
		id: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath, folder, id } ): ReadSnapshotResult => {
		return readSnapshot( projectId, folder, relPath, id );
	},
} );
