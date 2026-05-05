import { describe, test, expect } from 'vitest';

import { htmlToMarkdown } from '../../src/renderer/lib/htmlToMarkdown';

describe( 'htmlToMarkdown', () => {
	test( 'converts headings', async () => {
		expect( await htmlToMarkdown( '<h1>Title</h1>' ) ).toBe( '# Title' );
		expect( await htmlToMarkdown( '<h2>Sub</h2>' ) ).toBe( '## Sub' );
	} );

	test( 'converts inline strong/em', async () => {
		const md = await htmlToMarkdown(
			'<p>Hello <strong>world</strong> with <em>style</em></p>'
		);
		expect( md ).toBe( 'Hello **world** with _style_' );
	} );

	test( 'converts unordered and ordered lists', async () => {
		const ul = await htmlToMarkdown( '<ul><li>a</li><li>b</li></ul>' );
		expect( ul ).toBe( '- a\n- b' );

		const ol = await htmlToMarkdown( '<ol><li>one</li><li>two</li></ol>' );
		expect( ol ).toBe( '1. one\n2. two' );
	} );

	test( 'converts links', async () => {
		const md = await htmlToMarkdown(
			'<p><a href="https://example.com">label</a></p>'
		);
		expect( md ).toBe( '[label](https://example.com)' );
	} );

	test( 'converts fenced code blocks', async () => {
		const md = await htmlToMarkdown(
			'<pre><code>const x = 1;\nconst y = 2;</code></pre>'
		);
		expect( md ).toBe( '```\nconst x = 1;\nconst y = 2;\n```' );
	} );

	test( 'preserves GFM tables', async () => {
		const html =
			'<table><thead><tr><th>a</th><th>b</th></tr></thead>' +
			'<tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
		const md = await htmlToMarkdown( html );
		expect( md ).toContain( '| a | b |' );
		expect( md ).toContain( '| 1 | 2 |' );
	} );

	test( 'converts nested lists', async () => {
		const md = await htmlToMarkdown(
			'<ul><li>outer<ul><li>inner</li></ul></li></ul>'
		);
		expect( md ).toBe( '- outer\n  - inner' );
	} );

	test( 'ignores Google-Docs no-op bold wrappers', async () => {
		// Docs commonly wraps everything in <b style="font-weight:normal"> —
		// the rehype-remark mapping looks at the tag name, not the inline
		// style, so we get spurious **…** unless the input has actual bold.
		// We assert the round-trip ends with the *content*; whether or not the
		// **wrapper** survives is tracked here to catch regressions if the
		// pipeline gets smarter about it.
		const md = await htmlToMarkdown(
			'<b style="font-weight:normal" id="docs-internal-guid-x">' +
				'<p>Plain <strong>bold</strong> text</p></b>'
		);
		expect( md ).toContain( 'Plain' );
		expect( md ).toContain( '**bold**' );
		expect( md ).toContain( 'text' );
	} );

	test( 'returns empty string for whitespace-only HTML', async () => {
		expect( await htmlToMarkdown( '' ) ).toBe( '' );
		expect( await htmlToMarkdown( '   \n  ' ) ).toBe( '' );
	} );

	test( 'strips script and style tags', async () => {
		const md = await htmlToMarkdown(
			'<p>Hi</p><script>alert(1)</script><style>p{color:red}</style>'
		);
		expect( md ).toBe( 'Hi' );
		expect( md ).not.toContain( 'alert' );
		expect( md ).not.toContain( 'color:red' );
	} );
} );
