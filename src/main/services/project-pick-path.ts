import { dialog, type BrowserWindow } from 'electron';

export async function pickProjectPath(
	parent: BrowserWindow | null
): Promise< string | null > {
	const result = parent
		? await dialog.showOpenDialog( parent, {
				properties: [ 'openDirectory', 'createDirectory' ],
		  } )
		: await dialog.showOpenDialog( {
				properties: [ 'openDirectory', 'createDirectory' ],
		  } );
	if ( result.canceled || result.filePaths.length === 0 ) {
		return null;
	}
	return result.filePaths[ 0 ];
}
