// Single source of truth for "what's previewable in the resources panel."
// Used by ResourcesGrid (to decide which cards open a preview) and by
// ResourcePreview (to pick a body renderer).

export type PreviewKind = 'markdown' | 'image' | 'video' | 'pdf';

const IMAGE_EXTENSIONS: ReadonlySet< string > = new Set( [
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'svg',
	'avif',
] );

const VIDEO_EXTENSIONS: ReadonlySet< string > = new Set( [
	'mp4',
	'm4v',
	'webm',
	'mov',
	'ogv',
] );

const PDF_EXTENSIONS: ReadonlySet< string > = new Set( [ 'pdf' ] );

function fileExtension( name: string ): string {
	const dot = name.lastIndexOf( '.' );
	if ( dot <= 0 || dot === name.length - 1 ) {
		return '';
	}
	return name.slice( dot + 1 ).toLowerCase();
}

export function isMarkdown( name: string ): boolean {
	return fileExtension( name ) === 'md';
}

export function isImage( name: string ): boolean {
	return IMAGE_EXTENSIONS.has( fileExtension( name ) );
}

export function isVideo( name: string ): boolean {
	return VIDEO_EXTENSIONS.has( fileExtension( name ) );
}

export function isPdf( name: string ): boolean {
	return PDF_EXTENSIONS.has( fileExtension( name ) );
}

export function previewKind( name: string ): PreviewKind | null {
	if ( isMarkdown( name ) ) {
		return 'markdown';
	}
	if ( isImage( name ) ) {
		return 'image';
	}
	if ( isVideo( name ) ) {
		return 'video';
	}
	if ( isPdf( name ) ) {
		return 'pdf';
	}
	return null;
}

export function isPreviewable( name: string ): boolean {
	return previewKind( name ) !== null;
}
