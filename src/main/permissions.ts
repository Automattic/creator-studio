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

const READ_ONLY_COMMANDS = new Set( [
	'pwd',
	'ls',
	'cat',
	'head',
	'tail',
	'wc',
	'file',
	'stat',
	'which',
	'type',
	'command',
	'grep',
	'egrep',
	'fgrep',
	'rg',
	'ripgrep',
	'find',
	'fd',
	'locate',
	'tree',
	'date',
	'uname',
	'whoami',
	'id',
	'hostname',
	'basename',
	'dirname',
	'realpath',
	'readlink',
	'env',
	'true',
	'false',
	'echo',
] );

const GIT_READ_SUBCOMMANDS = new Set( [
	'status',
	'log',
	'diff',
	'show',
	'branch',
	'rev-parse',
	'rev-list',
	'ls-files',
	'ls-tree',
	'blame',
	'describe',
	'remote',
	'cat-file',
	'diff-tree',
	'for-each-ref',
	'reflog',
	'shortlog',
	'tag',
] );

// Strips quoted regions so operators inside literal strings don't count.
function stripQuoted( command: string ): string {
	return command
		.replace( /'[^']*'/g, '' )
		.replace( /"(?:\\.|[^"\\])*"/g, '' );
}

function hasWriteOperator( command: string ): boolean {
	return /(^|\s)(>>?|&>>?|>\||<<<?|<>)(\s|$)/.test( command );
}

// Command substitution (`$(...)` or backticks) can smuggle arbitrary writes
// past the allowlist, so reject these conservatively.
function hasCommandSubstitution( command: string ): boolean {
	return /\$\(|`/.test( command );
}

function classifyCommand( tokens: string[] ): boolean {
	if ( tokens.length === 0 ) {
		return false;
	}
	const head = tokens[ 0 ];
	if ( head === 'git' ) {
		const sub = tokens[ 1 ];
		return typeof sub === 'string' && GIT_READ_SUBCOMMANDS.has( sub );
	}
	return READ_ONLY_COMMANDS.has( head );
}

export function isReadOnlyBashCommand( command: string ): boolean {
	if ( typeof command !== 'string' || command.length === 0 ) {
		return false;
	}
	const scanned = stripQuoted( command );
	if ( hasWriteOperator( scanned ) || hasCommandSubstitution( scanned ) ) {
		return false;
	}
	// Split on pipelines and sequencing; every segment must be a read-only
	// command on its own. Using a permissive split that also catches `&&`,
	// `||`, `;`, and `|` (but not `||` twice).
	const segments = scanned.split( /\|\||&&|;|\|/ );
	for ( const raw of segments ) {
		const seg = raw.trim();
		if ( seg.length === 0 ) {
			return false;
		}
		// Tokenize on whitespace; don't try to be clever about quotes since
		// we already rejected dangerous operators above. The first non-flag
		// token (or first token regardless) is the command name.
		const tokens = seg.split( /\s+/ ).filter( ( t ) => t.length > 0 );
		if ( ! classifyCommand( tokens ) ) {
			return false;
		}
	}
	return true;
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
