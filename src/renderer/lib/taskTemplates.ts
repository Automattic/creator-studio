import type { TaskSchedule } from '../../types';

export type TaskTemplate = {
	id: string;
	title: string;
	description: string;
	instructions: string;
	schedule: TaskSchedule;
};

export const TASK_TEMPLATES: ReadonlyArray< TaskTemplate > = [
	{
		id: 'rss-feed-digest',
		title: 'RSS feed digest',
		description:
			'Fetches and summarizes the latest posts from RSS feeds into a new source file.',
		instructions: `Fetch the latest posts from these RSS feeds:

- {{FEED_URL_1}}
- {{FEED_URL_2}}

For each new post since the last run, write a short summary (2–3 sentences) with a link to the original. Group them by feed. Save the result as a new file in the project's sources/ folder named "RSS Digest — <today's date>.md".`,
		schedule: { kind: 'daily', time: '08:00' },
	},
	{
		id: 'github-release-notes',
		title: 'GitHub release notes',
		description:
			'Pulls recent merged PRs and commits from a repo and drafts a changelog.',
		instructions: `Fetch the recent activity for the GitHub repository {{OWNER}}/{{REPO}}:

- List merged pull requests from the last 7 days.
- Group them by category (features, bug fixes, chores, docs).
- Write a changelog entry for each PR: one sentence summarizing the change, with the PR number and link.

Save the result as a new file in the project's sources/ folder named "Release Notes — <today's date>.md".`,
		schedule: { kind: 'weekly', weekday: 1, time: '09:00' },
	},
	{
		id: 'github-issue-roundup',
		title: 'GitHub issue roundup',
		description:
			'Summarizes open issues from a GitHub repo with trends and priorities.',
		instructions: `Fetch open issues for the GitHub repository {{OWNER}}/{{REPO}}.

- List the most recent 20 open issues with their title, labels, and age.
- Highlight any issues opened in the last 7 days as "New."
- Note recurring themes or labels that appear frequently.
- Flag issues with no activity for over 30 days as "Stale."

Save the result as a new file in the project's sources/ folder named "Issue Roundup — <today's date>.md".`,
		schedule: { kind: 'weekly', weekday: 1, time: '09:00' },
	},
	{
		id: 'reddit-topic-monitor',
		title: 'Reddit topic monitor',
		description:
			'Scans a subreddit for posts matching keywords and compiles a briefing.',
		instructions: `Search the subreddit r/{{SUBREDDIT}} for recent posts mentioning these keywords:

- {{KEYWORD_1}}
- {{KEYWORD_2}}

For each matching post:
- Include the title, score, comment count, and link.
- Write a 1–2 sentence summary of the discussion.

Save the result as a new file in the project's sources/ folder named "Reddit Briefing — <today's date>.md".`,
		schedule: { kind: 'daily', time: '08:00' },
	},
	{
		id: 'competitor-watch',
		title: 'Competitor watch',
		description: 'Monitors competitor blogs and RSS feeds for new content.',
		instructions: `Fetch the latest posts from these competitor blogs or feeds:

- {{COMPETITOR_FEED_1}}
- {{COMPETITOR_FEED_2}}

For each new post published since the last run:
- Summarize the topic and key takeaways (2–3 sentences).
- Note any product announcements, pricing changes, or positioning shifts.

Save the result as a new file in the project's sources/ folder named "Competitor Watch — <today's date>.md".`,
		schedule: { kind: 'weekly', weekday: 1, time: '09:00' },
	},
	{
		id: 'link-research',
		title: 'Link research',
		description:
			'Fetches a URL (web page, YouTube, Reddit thread) and creates a structured research note.',
		instructions: `Fetch the content at this URL and create a structured research note:

{{URL}}

The note should include:
- Title and source
- A summary of the main points (3–5 bullet points)
- Key quotes or data worth referencing
- Any follow-up links mentioned in the content

Save the result as a new file in the project's sources/ folder named "Research — <title slug>.md".`,
		schedule: { kind: 'manual' },
	},
];
