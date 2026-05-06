import { describe, expect, test } from 'vitest';

import { markdownToHtml } from '../../src/renderer/lib/markdownToHtml';

describe( 'markdownToHtml', () => {
	test( 'converts headings', async () => {
		expect( await markdownToHtml( '# Title' ) ).toBe( '<h1>Title</h1>' );
		expect( await markdownToHtml( '## Sub' ) ).toBe( '<h2>Sub</h2>' );
	} );

	test( 'converts paragraph with inline emphasis', async () => {
		const html = await markdownToHtml( 'Hello **world** with _style_' );
		expect( html ).toBe(
			'<p>Hello <strong>world</strong> with <em>style</em></p>'
		);
	} );

	test( 'converts unordered and ordered lists', async () => {
		expect( await markdownToHtml( '- a\n- b' ) ).toBe(
			'<ul>\n<li>a</li>\n<li>b</li>\n</ul>'
		);
		expect( await markdownToHtml( '1. one\n2. two' ) ).toBe(
			'<ol>\n<li>one</li>\n<li>two</li>\n</ol>'
		);
	} );

	test( 'converts links', async () => {
		const html = await markdownToHtml( '[label](https://example.com)' );
		expect( html ).toBe( '<p><a href="https://example.com">label</a></p>' );
	} );

	test( 'converts fenced code blocks', async () => {
		const html = await markdownToHtml(
			'```\nconst x = 1;\nconst y = 2;\n```'
		);
		expect( html ).toBe(
			'<pre><code>const x = 1;\nconst y = 2;\n</code></pre>'
		);
	} );

	test( 'preserves GFM tables', async () => {
		const md = '| a | b |\n| - | - |\n| 1 | 2 |';
		const html = await markdownToHtml( md );
		expect( html ).toContain( '<table>' );
		expect( html ).toContain( '<th>a</th>' );
		expect( html ).toContain( '<td>1</td>' );
	} );

	test( 'supports GFM strikethrough and task lists', async () => {
		expect( await markdownToHtml( '~~done~~' ) ).toBe(
			'<p><del>done</del></p>'
		);
		const tasks = await markdownToHtml( '- [x] one\n- [ ] two' );
		expect( tasks ).toContain( 'type="checkbox"' );
		expect( tasks ).toContain( 'checked' );
	} );

	test( 'returns empty string for empty input', async () => {
		expect( await markdownToHtml( '' ) ).toBe( '' );
	} );
} );
