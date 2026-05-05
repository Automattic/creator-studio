import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

// `fragment: true` because clipboard HTML rarely arrives as a full document —
// without it rehype-parse wraps the input in <html><body> which leaks empty
// lines into the output.
const processor = unified()
	.use( rehypeParse, { fragment: true } )
	.use( rehypeRemark )
	.use( remarkGfm )
	.use( remarkStringify, {
		bullet: '-',
		emphasis: '_',
		strong: '*',
		fences: true,
		rule: '-',
	} );

export async function htmlToMarkdown( html: string ): Promise< string > {
	const file = await processor.process( html );
	return String( file ).trimEnd();
}
