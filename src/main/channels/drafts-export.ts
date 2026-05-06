import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

const MAX_BYTES = 25_000_000;

export type DraftExportResult =
	| { status: 'saved'; filePath: string }
	| { status: 'cancelled' }
	| { status: 'error'; reason: 'io-error' };

export const draftsExport = defineChannel( {
	name: IpcChannels.draftsExport,
	input: z.object( {
		relPath: z.string().min( 1 ),
		body: z.string().max( MAX_BYTES ),
	} ),
	handle: async (
		{ relPath, body },
		event
	): Promise< DraftExportResult > => {
		const parent = BrowserWindow.fromWebContents( event.sender );
		const suggestedName = path.basename( relPath ) || 'draft.md';
		const defaultPath = path.join(
			app.getPath( 'downloads' ),
			suggestedName
		);
		const opts = {
			defaultPath,
			filters: [
				{ name: 'Markdown', extensions: [ 'md' ] },
				{ name: 'All Files', extensions: [ '*' ] },
			],
		};
		const result = parent
			? await dialog.showSaveDialog( parent, opts )
			: await dialog.showSaveDialog( opts );
		if ( result.canceled || ! result.filePath ) {
			return { status: 'cancelled' };
		}
		try {
			await fs.promises.writeFile( result.filePath, body, 'utf-8' );
			return { status: 'saved', filePath: result.filePath };
		} catch {
			return { status: 'error', reason: 'io-error' };
		}
	},
} );
