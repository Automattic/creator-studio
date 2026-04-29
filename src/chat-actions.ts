/**
 * Single source of truth for chat starter actions. Both the empty-state
 * cards and the "+" menu render from this list, and `ChatKind` /
 * `PromptName` in src/types.ts derive their enum members from it — adding
 * a new starter is one entry here plus a `resources/prompts/<id>.md` file.
 */

export type ChatAction = {
	id: string;
	title: string;
	subtitle: string;
	menuLabel?: string;
	chatTitle: string;
};

// `as const` so the inferred element types stay literal — that's what lets
// `ChatActionId` below derive a narrow union (`'ideas' | 'draft'`) instead
// of widening to `string`. If actions ever become dynamic (user-defined,
// plugin-loaded), drop `as const` and `ChatActionId` collapses to `string`
// without touching call sites.
export const CHAT_ACTIONS = [
	{
		id: 'ideas',
		title: 'Brainstorm ideas',
		subtitle: 'Explore angles for a new post.',
		menuLabel: undefined as string | undefined,
		chatTitle: 'Ideas',
	},
	{
		id: 'draft',
		title: 'Discuss a new draft',
		subtitle: 'Shape an idea into an outline.',
		menuLabel: 'Discuss new draft',
		chatTitle: 'Draft',
	},
] as const satisfies readonly ChatAction[];

// Derived from CHAT_ACTIONS so the union and the runtime list can't drift.
// Used by the zod enums in src/types.ts and as the IPC contract for
// `prompt:get` and `chat:create`.
export type ChatActionId = ( typeof CHAT_ACTIONS )[ number ][ 'id' ];

export const CHAT_ACTION_IDS = CHAT_ACTIONS.map( ( a ) => a.id ) as [
	ChatActionId,
	...ChatActionId[],
];
