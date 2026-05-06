import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import {
	DRAFT_ASSET_MAX_BYTES,
	MIME_TO_EXT,
	writeDraftAsset,
} from './utils/draft-asset-store';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

// Base64-encoded payloads are ~4/3 the byte length; cap the input string
// loosely above that to fail fast without decoding.
const MAX_B64_LENGTH = Math.ceil( ( DRAFT_ASSET_MAX_BYTES * 4 ) / 3 ) + 16;

export type DraftSaveImageResult =
	| { ok: true; relPath: string }
	| { ok: false; reason: 'mime' | 'too-large' | 'not-found' | 'io-error' };

export const draftsSaveImage = defineChannel( {
	name: IpcChannels.draftsSaveImage,
	input: z.object( {
		projectId: z.string().min( 1 ),
		mimeType: z.string().min( 1 ),
		dataB64: z.string().max( MAX_B64_LENGTH ),
		originalFilename: z.string().optional(),
	} ),
	handle: ( { projectId, mimeType, dataB64 } ): DraftSaveImageResult => {
		const ext = MIME_TO_EXT[ mimeType.toLowerCase() ];
		if ( ! ext ) {
			return { ok: false, reason: 'mime' };
		}
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		let buf: Buffer;
		try {
			buf = Buffer.from( dataB64, 'base64' );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		return writeDraftAsset( project.path, buf, ext );
	},
} );
