import fs from 'node:fs';

export function loadPromptWithFolder(
	filePath: string,
	folderPath: string
): string {
	const raw = fs.readFileSync( filePath, 'utf-8' );
	return raw.split( '{{folder}}' ).join( folderPath );
}
