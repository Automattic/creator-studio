import path from 'node:path';

const STORE_DIR = '.creator-studio';

const STRUCTURED_FILE_TOOLS = new Set( [
	'Read',
	'Write',
	'Edit',
	'Glob',
	'Grep',
	'NotebookEdit',
] );

export function isInsideFolder( folder: string, target: string ): boolean {
	const abs = path.isAbsolute( target )
		? target
		: path.resolve( folder, target );
	const rel = path.relative( folder, abs );
	if ( rel === '' ) {
		return true;
	}
	return ! rel.startsWith( '..' ) && ! path.isAbsolute( rel );
}

export function isInsideStoreDir( folder: string, target: string ): boolean {
	return isInsideFolder( path.join( folder, STORE_DIR ), target );
}

type ToolInput = Record< string, unknown >;

function coerceInput( input: unknown ): ToolInput | null {
	return typeof input === 'object' && input !== null
		? ( input as ToolInput )
		: null;
}

function extractPathsForTool( toolName: string, input: ToolInput ): string[] {
	switch ( toolName ) {
		case 'Read':
		case 'Write':
		case 'Edit':
			return typeof input.file_path === 'string'
				? [ input.file_path ]
				: [];
		case 'NotebookEdit':
			return typeof input.notebook_path === 'string'
				? [ input.notebook_path ]
				: [];
		case 'Glob':
		case 'Grep':
			// path is optional; when absent, defaults to cwd (= folder root).
			return typeof input.path === 'string' ? [ input.path ] : [];
		default:
			return [];
	}
}

// Paths inside `.creator-studio/` are denied even when inside the folder so
// Claude can't rewrite its own chat history through tool calls.
export function shouldAutoAllowStructuredFileTool(
	toolName: string,
	input: unknown,
	folderPath: string
): boolean {
	if ( ! STRUCTURED_FILE_TOOLS.has( toolName ) ) {
		return false;
	}
	const obj = coerceInput( input );
	if ( ! obj ) {
		return false;
	}
	const paths = extractPathsForTool( toolName, obj );
	for ( const p of paths ) {
		if ( ! isInsideFolder( folderPath, p ) ) {
			return false;
		}
		if ( isInsideStoreDir( folderPath, p ) ) {
			return false;
		}
	}
	return true;
}
