// Matches ANSI CSI/OSC sequences. Covers color/style (`\x1b[…m`), cursor
// moves, and terminal bell. Good enough for rendering Bash output in a div.
const ANSI_PATTERN =
	// eslint-disable-next-line no-control-regex
	/[][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-ntqry=><~]))/g;

export function stripAnsi( value: string ): string {
	return value.replace( ANSI_PATTERN, '' );
}
