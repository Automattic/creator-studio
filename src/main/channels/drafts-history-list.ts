import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { listSnapshots, type DraftSnapshotMeta } from './utils/draft-history';
import { IpcChannels } from '.';

export const draftsHistoryList = defineChannel( {
	name: IpcChannels.draftsHistoryList,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.enum( [ 'drafts', 'done', 'sources', 'checks' ] ),
	} ),
	handle: ( { projectId, relPath, folder } ): DraftSnapshotMeta[] => {
		return listSnapshots( projectId, folder, relPath );
	},
} );
