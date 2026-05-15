import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

// Packaged (via extraResource in forge.config.ts): the binary's package
// directory is copied verbatim into Contents/Resources.
// Dev: the optional dep lives under the source tree's node_modules.
export function resolveClaudeCodeBinary(): string {
	const pkgDir = `claude-agent-sdk-${ process.platform }-${ process.arch }`;
	const packaged = path.join( process.resourcesPath, pkgDir, 'claude' );
	const dev = path.join(
		app.getAppPath(),
		'node_modules',
		'@anthropic-ai',
		pkgDir,
		'claude'
	);
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error( `Claude Code binary not found at ${ candidate }` );
	}
	fs.accessSync( candidate, fs.constants.X_OK );
	return candidate;
}

export function resolveBundledSettingsPath(): string {
	const packaged = path.join( process.resourcesPath, 'claude-defaults.json' );
	const dev = path.join(
		app.getAppPath(),
		'resources',
		'claude-defaults.json'
	);
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error(
			`Bundled claude-defaults.json not found at ${ candidate }`
		);
	}
	return candidate;
}

export function resolveBundledPromptPath( name: string ): string {
	const packaged = path.join( process.resourcesPath, 'prompts', name );
	const dev = path.join( app.getAppPath(), 'resources', 'prompts', name );
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error( `Bundled prompt not found at ${ candidate }` );
	}
	return candidate;
}

// Default check files copied verbatim into <project>/checks/ by the
// "Reset defaults" action. Lives outside resources/prompts/ because these
// are user-editable seed files, not internal prompt templates.
export function resolveBundledChecksDefaultsDir(): string {
	const packaged = path.join( process.resourcesPath, 'checks-defaults' );
	const dev = path.join( app.getAppPath(), 'resources', 'checks-defaults' );
	const candidate = fs.existsSync( packaged ) ? packaged : dev;
	if ( ! fs.existsSync( candidate ) ) {
		throw new Error(
			`Bundled checks-defaults directory not found at ${ candidate }`
		);
	}
	return candidate;
}
