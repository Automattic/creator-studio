import fs from 'node:fs';

// Loads a bundled prompt and substitutes `{{key}}` placeholders with the
// provided values. Unused keys in the file are left literal — that's how
// we add new variables without breaking existing prompts.
export function loadPrompt(
	filePath: string,
	vars: Record< string, string >
): string {
	let text = fs.readFileSync( filePath, 'utf-8' );
	for ( const [ key, value ] of Object.entries( vars ) ) {
		text = text.split( `{{${ key }}}` ).join( value );
	}
	return text;
}
