import fs from 'node:fs';

import { parseDraft } from './parse-draft';

// Skip absurdly large files so list/search calls don't stall on a 50MB blob
// someone dropped into the folder. Anything past this gets only mtime/name.
const MAX_PREVIEW_BYTES = 1024 * 1024;

export type MarkdownMeta = {
	title: string | null;
	excerpt: string | null;
};

export function readMarkdownMeta( filePath: string ): MarkdownMeta {
	const empty: MarkdownMeta = { title: null, excerpt: null };
	if ( ! filePath.toLowerCase().endsWith( '.md' ) ) {
		return empty;
	}
	let raw: string;
	try {
		const stat = fs.statSync( filePath );
		if ( stat.size > MAX_PREVIEW_BYTES ) {
			return empty;
		}
		raw = fs.readFileSync( filePath, 'utf-8' );
	} catch {
		return empty;
	}
	try {
		const parsed = parseDraft( raw, '' );
		return {
			title: parsed.titleFromFrontmatter ? parsed.title : null,
			excerpt: parsed.description || null,
		};
	} catch {
		return empty;
	}
}
