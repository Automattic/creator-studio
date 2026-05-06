import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { MIME_TO_EXT, writeDraftAsset } from './utils/draft-asset-store';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const EXT_BY_LOWERCASE: Record< string, string > = Object.values(
	MIME_TO_EXT
).reduce< Record< string, string > >( ( acc, ext ) => {
	acc[ ext ] = ext;
	if ( ext === 'jpg' ) {
		acc.jpeg = ext;
	}
	return acc;
}, {} );

export type DraftPickImageResult =
	| { ok: true; relPath: string; fileName: string }
	| {
			ok: false;
			reason:
				| 'canceled'
				| 'mime'
				| 'too-large'
				| 'not-found'
				| 'io-error';
	  };

export const draftsPickImage = defineChannel( {
	name: IpcChannels.draftsPickImage,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: async ( { projectId }, event ): Promise< DraftPickImageResult > => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const parent = BrowserWindow.fromWebContents( event.sender );
		const options: Electron.OpenDialogOptions = {
			defaultPath: project.path,
			properties: [ 'openFile' ],
			filters: [
				{
					name: 'Images',
					extensions: [ 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg' ],
				},
			],
		};
		const result = parent
			? await dialog.showOpenDialog( parent, options )
			: await dialog.showOpenDialog( options );
		if ( result.canceled || result.filePaths.length === 0 ) {
			return { ok: false, reason: 'canceled' };
		}
		const sourcePath = result.filePaths[ 0 ];
		const ext =
			EXT_BY_LOWERCASE[
				path.extname( sourcePath ).slice( 1 ).toLowerCase()
			];
		if ( ! ext ) {
			return { ok: false, reason: 'mime' };
		}
		let buf: Buffer;
		try {
			buf = fs.readFileSync( sourcePath );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const written = writeDraftAsset( project.path, buf, ext );
		if ( written.ok === true ) {
			return {
				ok: true,
				relPath: written.relPath,
				fileName: path.basename( sourcePath ),
			};
		}
		return { ok: false, reason: written.reason };
	},
} );
