import fs from 'node:fs';

export function loadPromptWithProjectPath(
	filePath: string,
	projectPath: string
): string {
	const raw = fs.readFileSync( filePath, 'utf-8' );
	return raw.split( '{{project}}' ).join( projectPath );
}
