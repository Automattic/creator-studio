import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Simulates the DataTransfer payload that handleCardDragStart writes during
// a real drag. We can't synthesize an OS-level drag from Playwright, but the
// internal-card flow is pure DOM events on private MIME types, which we *can*
// dispatch from the page context.
type DispatchParams = {
	sourceSelector: string;
	targetSelector: string;
	items: Array< {
		folder: 'sources' | 'drafts' | 'done';
		relPath: string;
		name: string;
		kind: 'file' | 'dir';
	} >;
	projectId: string | null;
	sourceGroup: 'sources' | 'drafts' | 'done';
};

// Synthesizes a card drag (internal MIME types only) so the test can drive
// drop targets without needing real OS-level drag. Returns the post-dragover
// hover attribute so the test can prove the React onDragOver handler accepted
// the event before asserting on the side effect.
async function dispatchInternalDrop(
	params: DispatchParams
): Promise< { afterOver: string | null } > {
	const target = document.querySelector( params.targetSelector );
	if ( ! target ) {
		return { afterOver: 'missing-target' };
	}
	// sourceSelector isn't used by the drop dispatch — the drop event only
	// targets the destination — but callers pass it for symmetry with the
	// real flow and so a future tweak can swap to mousedown-style begin.
	void params.sourceSelector;
	const payload = JSON.stringify( {
		projectId: params.projectId,
		items: params.items,
	} );
	const dt = new DataTransfer();
	dt.setData( 'application/x-studio-write-resources', payload );
	dt.setData(
		`application/x-studio-write-resources-${ params.sourceGroup }`,
		''
	);
	target.dispatchEvent(
		new DragEvent( 'dragenter', {
			bubbles: true,
			cancelable: true,
			composed: true,
			dataTransfer: dt,
		} )
	);
	target.dispatchEvent(
		new DragEvent( 'dragover', {
			bubbles: true,
			cancelable: true,
			composed: true,
			dataTransfer: dt,
		} )
	);
	const afterOver =
		target.getAttribute( 'data-drop-target' ) ??
		target.getAttribute( 'data-drop-active' );
	target.dispatchEvent(
		new DragEvent( 'drop', {
			bubbles: true,
			cancelable: true,
			composed: true,
			dataTransfer: dt,
		} )
	);
	return { afterOver };
}

test.describe( 'drag & drop on project view', () => {
	test.describe.configure( { retries: 1, timeout: 60_000 } );

	test( 'cmd-click + shift-click selects a range of cards', async () => {
		const fixture = seedLinkedProjects( 1, {
			'sources/a.md': '# A',
			'sources/b.md': '# B',
			'sources/c.md': '# C',
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
			.locator( '[data-testid="resources-card-sources-a.md"]' )
			.click( { modifiers: [ 'Meta' ] } );
		await win
			.locator( '[data-testid="resources-card-sources-c.md"]' )
			.click( { modifiers: [ 'Shift' ] } );

		const selected = await win.evaluate( () =>
			Array.from(
				document.querySelectorAll(
					'[data-testid^="resources-card-"][data-kind="file"][data-selected="true"]'
				)
			).map( ( c ) => c.getAttribute( 'data-testid' ) )
		);
		expect( selected.sort() ).toEqual( [
			'resources-card-sources-a.md',
			'resources-card-sources-b.md',
			'resources-card-sources-c.md',
		] );

		await app.close();
		fixture.cleanup();
	} );

	test( 'dropping a sources file on a sources folder card moves it on disk', async () => {
		const fixture = seedLinkedProjects( 1, {
			'sources/note.md': '# Note\nbody\n',
			'sources/Bucket/.gitkeep': '',
		} );
		const project = fixture.projects[ 0 ];
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
		// Wait for the Bucket folder card to appear.
		await win
			.locator( '[data-testid="resources-card-sources-Bucket"]' )
			.waitFor();

		const projectId = await win
			.locator( '[data-testid=screen-project]' )
			.getAttribute( 'data-project-id' );

		const dispatchResult = await win.evaluate( dispatchInternalDrop, {
			sourceSelector: '[data-testid="resources-card-sources-note.md"]',
			targetSelector: '[data-testid="resources-card-sources-Bucket"]',
			items: [
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			projectId,
			sourceGroup: 'sources',
		} );
		// Dragover should have flipped the folder card hover state on; that
		// proves React's onDragOver received the event with the correct MIME
		// type. The renderer then queues the move IPC, which we wait on below.
		expect( dispatchResult ).toMatchObject( { afterOver: 'true' } );

		// Disk-level assertion — the renderer's refresh may not have settled
		// yet, but the IPC call ran synchronously through `await`.
		await expect
			.poll(
				() =>
					fs.existsSync(
						path.join(
							project.path,
							'sources',
							'Bucket',
							'note.md'
						)
					),
				{ timeout: 15_000 }
			)
			.toBe( true );
		expect(
			fs.existsSync( path.join( project.path, 'sources', 'note.md' ) )
		).toBe( false );

		await app.close();
		fixture.cleanup();
	} );

	test( 'dropping a drafts file on a sources folder is rejected (cross-group blocked)', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/post.md': '# Post\nbody\n',
			'sources/Bucket/.gitkeep': '',
		} );
		const project = fixture.projects[ 0 ];
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
			.locator( '[data-testid="resources-card-sources-Bucket"]' )
			.waitFor();

		const projectId = await win
			.locator( '[data-testid=screen-project]' )
			.getAttribute( 'data-project-id' );

		const result = await win.evaluate( dispatchInternalDrop, {
			// Source doesn't have to exist as a DOM card — the dispatch logic
			// reads sourceSelector but only target receives the event. We pass
			// the Bucket itself to satisfy the selector check.
			sourceSelector: '[data-testid="resources-card-sources-Bucket"]',
			targetSelector: '[data-testid="resources-card-sources-Bucket"]',
			items: [
				{
					folder: 'drafts',
					relPath: 'post.md',
					name: 'post.md',
					kind: 'file',
				},
			],
			projectId,
			sourceGroup: 'drafts',
		} );

		// The folder card refused to highlight — the drafts MIME isn't in its
		// accept list.
		expect( result ).toMatchObject( { afterOver: 'false' } );
		// And the draft did not move into sources/.
		await win.waitForTimeout( 200 );
		expect(
			fs.existsSync(
				path.join( project.path, 'sources', 'Bucket', 'post.md' )
			)
		).toBe( false );
		expect(
			fs.existsSync( path.join( project.path, 'drafts', 'post.md' ) )
		).toBe( true );

		await app.close();
		fixture.cleanup();
	} );

	test( 'dropping a sources card on the chat panel attaches it as a chip', async () => {
		const fixture = seedLinkedProjects( 1, {
			'sources/note.md': '# Note\nbody\n',
		} );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Wait for the project view to settle, then start a chat through the
		// IPC so we don't depend on the rail/header click chain (the panel
		// header buttons live in a transformed layer that occasionally
		// intercepts the chat-add click in headless runs).
		await win.locator( '[data-testid=screen-project]' ).waitFor();
		const projectId = await win
			.locator( '[data-testid=screen-project]' )
			.getAttribute( 'data-project-id' );
		await win.evaluate( async ( pid ) => {
			await window.api.chat.create( pid, { title: 'Test chat' } );
		}, projectId );
		// Let App.tsx pick up the new chat (chatsByProject + activeChatIdByProject
		// reconcile on the project's chats:list refresh).
		await win.waitForTimeout( 500 );
		await win.locator( '[data-testid=draft-chat-panel]' ).waitFor();

		await win.evaluate( dispatchInternalDrop, {
			sourceSelector: '[data-testid=draft-chat-panel]',
			targetSelector: '[data-testid=draft-chat-panel]',
			items: [
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			projectId,
			sourceGroup: 'sources',
		} );

		await expect(
			win.locator( '[data-testid=composer-attachment-chip]' )
		).toHaveCount( 1 );

		await app.close();
		fixture.cleanup();
	} );
} );
