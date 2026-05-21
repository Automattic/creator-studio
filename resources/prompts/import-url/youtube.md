Import a YouTube URL as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

Steps:

1. **Fetch the video.** Call the `fetch_youtube` tool with the URL above. It
   returns the title, channel, description and — when captions exist — the
   transcript, in one call. Do NOT use the shell, `curl`, `wget`, `python` or
   `WebFetch`; `fetch_youtube` already does everything and needs no setup.
2. **If `fetch_youtube` returns an error or says the video is unavailable,**
   save what you do have (at least the URL) and note plainly that the video
   could not be retrieved. Never fabricate a description or transcript.
3. **Summarize in your own words.** One paragraph on what the video covers,
   plus 3–6 bullet takeaways when the description or transcript supports it.
4. **Save the result.** Write a Markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the video title (fallback: `youtube-source`),
      `.md`. On collision suffix `-2`, `-3`.
    - Frontmatter (YAML): `title`, `url`, `kind: youtube`, plus `channel`,
      `imported`, and `duration` when you have them. Omit fields you don't.
    - Body sections, in order: summary, key takeaways, full description, then
      the transcript under a `## Transcript` heading. Drop sections you have
      no content for.
5. **Finish.** End your final message with a one-line `SUMMARY:` of what you
   saved and anything missing (e.g. "no transcript available").
