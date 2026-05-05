// Builds a tiny but fully valid single-page PDF — small enough to embed in a
// test, structured enough that pdf.js parses it, runs the page, and mounts
// the text layer over the canvas. We need a *real* render (not a placeholder)
// so regression tests can exercise overlays that only appear once the page
// has actually rendered.

export function makeMinimalPdf(): Buffer {
	const objects = [
		'<</Type/Catalog/Pages 2 0 R>>',
		'<</Type/Pages/Kids[3 0 R]/Count 1>>',
		'<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>',
		'<</Length 44>>\nstream\nBT /F1 12 Tf 50 700 Td (Hello PDF) Tj ET\nendstream',
	];
	let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
	const offsets: number[] = [ 0 ];
	for ( let i = 0; i < objects.length; i++ ) {
		offsets.push( body.length );
		body += `${ i + 1 } 0 obj\n${ objects[ i ] }\nendobj\n`;
	}
	const xrefStart = body.length;
	body += `xref\n0 ${ objects.length + 1 }\n`;
	body += '0000000000 65535 f \n';
	for ( let i = 1; i <= objects.length; i++ ) {
		body += `${ String( offsets[ i ] ).padStart( 10, '0' ) } 00000 n \n`;
	}
	body += `trailer<</Size ${
		objects.length + 1
	}/Root 1 0 R>>\nstartxref\n${ xrefStart }\n%%EOF`;
	return Buffer.from( body, 'binary' );
}
