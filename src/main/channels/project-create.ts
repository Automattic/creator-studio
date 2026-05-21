import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { z } from 'zod';

import { seedDefaultChecksIfEmpty } from './utils/checks-seed';
import { defineChannel } from './utils/define-channel';
import {
	findProjectByPath,
	readStore,
	writeStore,
} from './utils/project-store';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';
import type { Project, ProjectCreateResult } from '../../types';

const Input = z.object( {
	path: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );

export const projectCreate = defineChannel( {
	name: IpcChannels.projectCreate,
	input: Input,
	handle: ( input ): ProjectCreateResult => {
		const store = readStore();
		const existing = findProjectByPath( store, input.path );
		if ( existing ) {
			return { status: 'already-linked', existing };
		}

		const seeded = seedDefaultChecksIfEmpty( input.path );
		if ( ! seeded.ok ) {
			// eslint-disable-next-line no-console
			console.warn(
				`projectCreate: failed to seed default checks at ${
					input.path
				} (${ 'reason' in seeded ? seeded.reason : 'unknown' })`
			);
		}

		const project: Project = {
			id: randomUUID(),
			path: input.path,
			label: path.basename( input.path ),
			name: input.name,
			goal: input.goal,
			lastOpenedAt: Date.now(),
		};
		store.projects.push( project );
		writeStore( store );
		getTaskManager().hydrateProject( project );
		return { status: 'ok', project };
	},
} );
