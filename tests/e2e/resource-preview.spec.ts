import {
	test,
	expect,
	_electron as electron,
	type Page,
} from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { makeMinimalPdf } from '../helpers/minimal-pdf';

async function selectFirstPreviewLine( win: Page ): Promise< void > {
	const docStart =
		process.platform === 'darwin' ? 'Meta+Home' : 'Control+Home';
	await win
		.locator( '[data-testid=resource-preview-editor] .cm-content' )
		.click();
	await win.keyboard.press( docStart );
	await win.keyboard.press( 'Home' );
	await win.keyboard.press( 'Shift+End' );
}

// Verifies the click-on-draft-card behavior without depending on the agent
// finishing its turn. The chat is created and the preview is shown before
// `agent:send` even starts streaming, so the UI assertions resolve quickly
// even if no API key is set (the assistant bubble will just error out).
test.describe( 'draft cards: preview on click, attach via menu', () => {
	test.describe.configure( { retries: 1, timeout: 60_000 } );

	test( 'click → preview only; menu "Add to chat" stages attachment; "Open new chat" creates a fresh chat', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/foo.md': '# Foo draft\n\nSome body text.\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Wait for the auto-created default chat tab so we can baseline the
		// count before clicking the draft card.
		const realChatTabs = win.locator(
			'[data-testid^=chat-tab-]:not([data-testid^="chat-tab-running-"])'
		);
		await expect( realChatTabs ).toHaveCount( 1 );

		// The drafts group is collapsed by default — expand it so the cards
		// render.
		const draftsGroup = win.locator(
			'[data-testid=resources-group-drafts]'
		);
		await expect( draftsGroup ).toBeVisible();
		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();
		const draftCard = win.locator(
			'[data-testid="resources-card-drafts-foo.md"]'
		);
		await expect( draftCard ).toBeVisible();

		// Card click → preview only, no new chat tab.
		await draftCard.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();
		await expect(
			win.locator( '[data-testid=resource-preview-title]' )
		).toHaveText( 'foo.md' );
		await expect(
			win.locator( '[data-testid=resource-preview-body]' )
		).toContainText( 'Some body text' );
		// Resources grid should no longer be in the DOM while previewing.
		await expect(
			win.locator( '[data-testid=resources-grid]' )
		).toHaveCount( 0 );
		// No new chat created from a plain card click.
		await expect( realChatTabs ).toHaveCount( 1 );

		// Back button restores the resources grid.
		await win.locator( '[data-testid=resource-preview-back]' ).click();
		await expect( preview ).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=resources-grid]' )
		).toBeVisible();
		await expect( draftCard ).toBeVisible();

		// "Add to chat" attaches to the active chat without creating a new
		// one — count stays at 1 and the composer chip shows up.
		await win
			.locator(
				'[data-testid="resources-card-drafts-foo.md-menu-button"]'
			)
			.click();
		const addToChat = win.locator(
			'[data-testid=draft-action-add-to-chat]'
		);
		await expect( addToChat ).toBeEnabled();
		await addToChat.click();
		await expect( realChatTabs ).toHaveCount( 1 );
		await expect(
			win.locator( '[data-testid=composer-attachment-chip]' )
		).toContainText( 'foo.md' );

		// Remove the chip so the next action starts from a clean composer.
		await win.locator( '[data-testid=composer-attachment-remove]' ).click();
		await expect(
			win.locator( '[data-testid=composer-attachment-chip]' )
		).toHaveCount( 0 );

		// "Open new chat" creates a fresh chat tab and stages the attachment
		// in the new chat.
		await win
			.locator(
				'[data-testid="resources-card-drafts-foo.md-menu-button"]'
			)
			.click();
		await win.locator( '[data-testid=draft-action-new-chat]' ).click();
		await expect( preview ).toBeVisible();
		await expect( realChatTabs ).toHaveCount( 2 );
		const activeTab = win.locator(
			'[data-testid^=chat-tab-]:not([data-testid^="chat-tab-running-"])[data-active="true"]'
		);
		await expect( activeTab ).toContainText( 'foo' );
		await expect(
			win.locator( '[data-testid=composer-attachment-chip]' )
		).toContainText( 'foo.md' );

		// Re-clicking the card just re-previews — never creates another
		// chat. The "Open new chat" action is the only way to grow the tab
		// count.
		await win.locator( '[data-testid=resource-preview-back]' ).click();
		await draftCard.click();
		await expect( preview ).toBeVisible();
		await expect( realChatTabs ).toHaveCount( 2 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'selecting source preview text shows Chat and pins the selection in the sidebar', async () => {
		const fixture = seedLinkedProjects( 1, {
			'sources/notes.md':
				'First source paragraph for selection preview.\n\nSecond source paragraph.\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();
		await win
			.locator( '[data-testid="resources-card-sources-notes.md"]' )
			.click();
		await expect(
			win.locator( '[data-testid=resource-preview-editor]' )
		).toBeVisible();

		await win.locator( '[data-testid=draft-sidebar-close]' ).click();
		await expect(
			win.locator( '[data-testid=draft-sidebar][data-open=false]' )
		).toBeVisible();

		await selectFirstPreviewLine( win );
		await expect(
			win.locator( '[data-testid=selection-menu-chat]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=selection-menu-add-to-chat]' )
		).toHaveCount( 0 );

		await win.locator( '[data-testid=selection-menu-chat]' ).click();
		await expect(
			win.locator( '[data-testid=draft-sidebar][data-open=true]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-body][data-tab=chat]' )
		).toBeVisible();
		const chip = win.locator( '[data-testid=draft-chat-selection]' );
		await expect( chip ).toContainText( '1 selection' );
		await expect( chip ).toHaveAttribute( 'title', /sources\/notes\.md/ );

		await app.close();
		fixture.cleanup();
	} );

	test( 'selecting draft preview text shows Add to chat and clears the highlight after pinning', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/preview.md':
				'First draft paragraph for selection preview.\n\nSecond draft paragraph.\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();
		await win
			.locator( '[data-testid="resources-card-drafts-preview.md"]' )
			.click();
		await expect(
			win.locator( '[data-testid=resource-preview-editor]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar][data-open=true]' )
		).toBeVisible();

		await selectFirstPreviewLine( win );
		await expect(
			win.locator( '[data-testid=selection-menu-add-to-chat]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=selection-menu-chat]' )
		).toHaveCount( 0 );

		await win.locator( '[data-testid=selection-menu-add-to-chat]' ).click();
		const chip = win.locator( '[data-testid=draft-chat-selection]' );
		await expect( chip ).toContainText( '1 selection' );
		await expect( chip ).toHaveAttribute( 'title', /drafts\/preview\.md/ );
		await expect(
			win.locator( '[data-testid=selection-menu]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'markdown cards in any group are clickable; non-markdown cards stay inert', async () => {
		const fixture = seedLinkedProjects( 1, {
			'done/already.md': '# Already done\n',
			'sources/notes.md': '# Notes\n',
			'sources/data.json': '{"k":1}\n',
			'drafts/clickable.md': '# Clickable\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// All three groups start collapsed; expand them.
		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();
		await win
			.locator( '[data-testid=resources-group-collapse-done]' )
			.click();
		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();

		// Markdown cards in every group are <button> (preview opens on click).
		for ( const sel of [
			'[data-testid="resources-card-drafts-clickable.md"]',
			'[data-testid="resources-card-done-already.md"]',
			'[data-testid="resources-card-sources-notes.md"]',
		] ) {
			const card = win.locator( sel );
			await expect( card ).toBeVisible();
			await expect( card ).toHaveJSProperty( 'tagName', 'BUTTON' );
		}

		// Non-markdown source file stays inert: <article> with the
		// "not previewable" marker.
		const jsonCard = win.locator(
			'[data-testid="resources-card-sources-data.json"]'
		);
		await expect( jsonCard ).toBeVisible();
		await expect( jsonCard ).toHaveJSProperty( 'tagName', 'ARTICLE' );
		await expect( jsonCard ).toHaveAttribute( 'data-previewable', 'false' );

		// Clicking a done markdown card opens the preview.
		await win
			.locator( '[data-testid="resources-card-done-already.md"]' )
			.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();
		await expect(
			win.locator( '[data-testid=resource-preview-body]' )
		).toContainText( 'Already done' );
		// Drafts-only "Edit" action shouldn't show for non-drafts.
		await win
			.locator( '[data-testid=resource-preview-menu-button]' )
			.click();
		await expect(
			win.locator( '[data-testid=draft-action-edit]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'image cards open an image preview; Edit is hidden even for image drafts', async () => {
		const svg =
			'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#36c"/></svg>';
		const fixture = seedLinkedProjects( 1, {
			'sources/diagram.svg': svg,
			'drafts/cover.svg': svg,
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();
		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();

		// SVG card in sources is previewable (rendered as <button>).
		const svgCard = win.locator(
			'[data-testid="resources-card-sources-diagram.svg"]'
		);
		await expect( svgCard ).toBeVisible();
		await expect( svgCard ).toHaveJSProperty( 'tagName', 'BUTTON' );

		await svgCard.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();
		const body = win.locator( '[data-testid=resource-preview-body]' );
		await expect( body ).toHaveAttribute( 'data-kind', 'image' );
		const img = win.locator( '[data-testid=resource-preview-image] img' );
		await expect( img ).toBeVisible();
		await expect( img ).toHaveAttribute(
			'src',
			/^studio-asset:\/\/.+\/sources\/diagram\.svg/
		);

		await win.locator( '[data-testid=resource-preview-back]' ).click();

		// Image draft: preview opens, but Edit action stays hidden because
		// editing is markdown-only.
		await win
			.locator( '[data-testid="resources-card-drafts-cover.svg"]' )
			.click();
		await expect( preview ).toBeVisible();
		await win
			.locator( '[data-testid=resource-preview-menu-button]' )
			.click();
		await expect(
			win.locator( '[data-testid=draft-action-edit]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'video cards open a video preview', async () => {
		// Placeholder content is fine — we only assert the <video> element
		// mounts with the expected studio-asset src. Chromium's decoder will
		// reject the bytes, but the DOM is what we care about here.
		const fixture = seedLinkedProjects( 1, {
			'sources/clip.mp4': 'placeholder mp4 bytes',
			'sources/notes.md': '# Notes\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();

		const videoCard = win.locator(
			'[data-testid="resources-card-sources-clip.mp4"]'
		);
		await expect( videoCard ).toBeVisible();
		await expect( videoCard ).toHaveJSProperty( 'tagName', 'BUTTON' );

		await videoCard.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();
		const body = win.locator( '[data-testid=resource-preview-body]' );
		await expect( body ).toHaveAttribute( 'data-kind', 'video' );
		const video = win.locator(
			'[data-testid=resource-preview-video] video'
		);
		await expect( video ).toHaveAttribute(
			'src',
			/^studio-asset:\/\/.+\/sources\/clip\.mp4/
		);

		await app.close();
		fixture.cleanup();
	} );

	test( 'txt cards open a text preview that preserves whitespace and literal markdown syntax', async () => {
		// `# Heading` would render as an <h1> if we routed .txt through the
		// markdown renderer; we need to see the literal `#`. Tab-aligned
		// columns and the trailing blank line are also there to confirm
		// `<pre>`-style whitespace handling.
		const txtBody =
			'# not a heading\n' +
			'line two with *no italics*\n' +
			'col1\tcol2\tcol3\n' +
			'\n' +
			'last line\n';
		const fixture = seedLinkedProjects( 1, {
			'sources/notes.txt': txtBody,
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();

		const txtCard = win.locator(
			'[data-testid="resources-card-sources-notes.txt"]'
		);
		await expect( txtCard ).toBeVisible();
		await expect( txtCard ).toHaveJSProperty( 'tagName', 'BUTTON' );

		await txtCard.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();

		const body = win.locator( '[data-testid=resource-preview-body]' );
		await expect( body ).toHaveAttribute( 'data-kind', 'text' );

		const textBlock = win.locator( '[data-testid=resource-preview-text]' );
		await expect( textBlock ).toBeVisible();
		// Must be rendered as a <pre> — that's what preserves newlines.
		await expect( textBlock ).toHaveJSProperty( 'tagName', 'PRE' );
		// Literal `#` survives (no heading promotion).
		await expect( textBlock ).toContainText( '# not a heading' );
		await expect( textBlock ).toContainText( '*no italics*' );
		// No <h1>/<h2> were emitted by a stray markdown render.
		await expect(
			win.locator( '[data-testid=resource-preview-body] h1' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'pdf cards open a pdf preview', async () => {
		// Placeholder bytes — react-pdf will surface its error slot inside
		// the wrapper, but the wrapper itself (and the kind attribute) is
		// what proves routing + dispatch are wired. Real-PDF rendering is
		// covered by the regression test below.
		const fixture = seedLinkedProjects( 1, {
			'sources/sample.pdf': 'placeholder pdf bytes',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();

		const pdfCard = win.locator(
			'[data-testid="resources-card-sources-sample.pdf"]'
		);
		await expect( pdfCard ).toBeVisible();
		await expect( pdfCard ).toHaveJSProperty( 'tagName', 'BUTTON' );

		await pdfCard.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();
		const body = win.locator( '[data-testid=resource-preview-body]' );
		await expect( body ).toHaveAttribute( 'data-kind', 'pdf' );
		await expect(
			win.locator( '[data-testid=resource-preview-pdf]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'pdf preview action menu sits above the rendered text layer', async () => {
		// Regression: react-pdf's `.textLayer` is `position: absolute;
		// z-index: 2` and covers the page area. The preview header (sticky,
		// z-index: 3) creates a stacking context that has to outrank that
		// layer; otherwise the header's dropdown menu renders behind the
		// text layer and clicks on its items get swallowed.
		const fixture = seedLinkedProjects( 1, {
			'sources/sample.pdf': makeMinimalPdf(),
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const realChatTabs = win.locator(
			'[data-testid^=chat-tab-]:not([data-testid^="chat-tab-running-"])'
		);
		await expect( realChatTabs ).toHaveCount( 1 );

		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();

		await win
			.locator( '[data-testid="resources-card-sources-sample.pdf"]' )
			.click();
		const preview = win.locator( '[data-testid=resource-preview]' );
		await expect( preview ).toBeVisible();

		// Wait for pdf.js to actually render the page so the text layer
		// mounts — without this the regression condition isn't set up.
		await expect(
			win.locator(
				'[data-testid=resource-preview-pdf] .react-pdf__Page__canvas'
			)
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=resource-preview-pdf] .textLayer' )
		).toBeAttached();

		await win
			.locator( '[data-testid=resource-preview-menu-button]' )
			.click();
		const newChatItem = win.locator(
			'[data-testid=draft-action-new-chat]'
		);
		await expect( newChatItem ).toBeVisible();

		// Hit-test the geometric centre of the menu item: if the textLayer
		// (or anything else) is intercepting the click, elementFromPoint
		// returns the overlay instead of our menu item. This is the precise
		// pre-fix failure mode.
		const topAtCentre = await newChatItem.evaluate( ( el ) => {
			const r = el.getBoundingClientRect();
			const top = document.elementFromPoint(
				r.x + r.width / 2,
				r.y + r.height / 2
			);
			return top?.getAttribute( 'data-testid' ) ?? top?.className ?? '';
		} );
		expect( topAtCentre ).toBe( 'draft-action-new-chat' );

		// And the click itself must fan out into a new chat tab + chip.
		await newChatItem.click();
		await expect( realChatTabs ).toHaveCount( 2 );
		await expect(
			win.locator( '[data-testid=composer-attachment-chip]' )
		).toContainText( 'sample.pdf' );

		await app.close();
		fixture.cleanup();
	} );
} );
