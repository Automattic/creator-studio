import fs from 'node:fs';

import { parseDraft } from './parse-draft';

// Skip absurdly large files so list/search calls don't stall on a 50MB blob
// someone dropped into the folder. Anything past this gets only mtime/name.
const MAX_PREVIEW_BYTES = 1024 * 1024;

export function readMarkdownExcerpt( filePath: string ): string | null {
	if ( ! filePath.toLowerCase().endsWith( '.md' ) ) {
		return null;
	}
	let raw: string;
	try {
		const stat = fs.statSync( filePath );
		if ( stat.size > MAX_PREVIEW_BYTES ) {
			return null;
		}
		raw = fs.readFileSync( filePath, 'utf-8' );
	} catch {
		return null;
	}
	try {
		const parsed = parseDraft( raw, '' );
		return parsed.description || null;
	} catch {
		return null;
	}
}
