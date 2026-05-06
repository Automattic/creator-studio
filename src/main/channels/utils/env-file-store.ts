import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

const API_KEY_VAR = 'ANTHROPIC_API_KEY';

// Tests set STUDIO_WRITE_ENV_FILE to a tmp path so settings:set never touches
// the developer's repo-root .env. In dev, the file lives at the project root
// (so process.loadEnvFile() at boot picks it up). Packaged builds don't have a
// writable repo root, so we fall back to <userData>/.env.
export function envFilePath(): string {
	const override = process.env.STUDIO_WRITE_ENV_FILE;
	if ( override ) {
		return override;
	}
	if ( app.isPackaged ) {
		return path.join( app.getPath( 'userData' ), '.env' );
	}
	return path.join( app.getAppPath(), '.env' );
}

export function readApiKey(): string {
	return process.env[ API_KEY_VAR ] ?? '';
}

// Quote values that contain whitespace, `#`, or quotes themselves so dotenv
// parsers (and Node's process.loadEnvFile) read them back unchanged. Pure
// alphanum/dash/underscore values stay unquoted to match what users typically
// hand-write.
function formatValue( value: string ): string {
	if ( value === '' ) {
		return '';
	}
	if ( /^[A-Za-z0-9_\-./:]+$/.test( value ) ) {
		return value;
	}
	const escaped = value.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' );
	return `"${ escaped }"`;
}

// Upserts the ANTHROPIC_API_KEY=… line in `.env`, preserving every other
// line (comments, other vars, blank lines). Then mirrors the value into
// process.env so the next agent:send picks it up without an app restart.
export function writeApiKey( key: string ): void {
	const file = envFilePath();
	const formatted = `${ API_KEY_VAR }=${ formatValue( key ) }`;

	let next: string;
	if ( fs.existsSync( file ) ) {
		const current = fs.readFileSync( file, 'utf-8' );
		const lines = current.split( /\r?\n/ );
		const keyLine = new RegExp( `^\\s*${ API_KEY_VAR }\\s*=` );
		let replaced = false;
		const updated = lines.map( ( line ) => {
			if ( keyLine.test( line ) ) {
				replaced = true;
				return formatted;
			}
			return line;
		} );
		if ( ! replaced ) {
			// Drop a single trailing empty string from split() so we don't
			// add a stray blank line above the new entry.
			if ( updated.length > 0 && updated[ updated.length - 1 ] === '' ) {
				updated.pop();
			}
			updated.push( formatted );
		}
		next = updated.join( '\n' );
		if ( ! next.endsWith( '\n' ) ) {
			next += '\n';
		}
	} else {
		next = `${ formatted }\n`;
	}

	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, next, 'utf-8' );
	process.env[ API_KEY_VAR ] = key;
}
