Import a YouTube URL as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

Plan the work as a checklist (use TodoWrite) and follow it:

1. **Fetch the video page.** `WebFetch` for the watch URL first; fall back to `curl -sL -A "Mozilla/5.0"` if you need raw HTML. Extract from `<meta>` and the embedded JSON (`ytInitialData`, `ytInitialPlayerResponse`).
2. **Pull what you can find:**
    - Title, channel / author, channel URL
    - Publication or upload date
    - Duration
    - View count, like count, comment count (best-effort — these are often shadowed)
    - Full description text
    - Tags / categories if exposed
3. **Transcript.** Try in this order; stop at the first one that yields text:
    - YouTube's `timedtext` endpoint (`https://www.youtube.com/api/timedtext?v=<id>&lang=en` and the auto-generated `&kind=asr` variant).
    - Any `captionTracks` URLs you find inside `ytInitialPlayerResponse`.
    - If both fail, note that no transcript was available — do not fabricate one.
4. **Comments.** If the page exposes top comments inline (some embeds do), capture 3–5 highlights with author + text. Skip silently if not available — comments behind XHR aren't worth chasing.
5. **Summarize in your own words.** One paragraph on what the video covers, plus 3–6 bullet takeaways if the description / transcript supports it.
6. **Save the result.** Write a markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the video title (fallback: `youtube-<videoId>`), `.md`. On collision suffix `-2`, `-3`.
    - Frontmatter (YAML): `title`, `url`, `kind: youtube`, plus whichever of `channel`, `channel_url`, `published`, `imported`, `duration`, `views`, `likes`, `comments`, `tags` you actually have. Omit fields you couldn't extract.
    - Body sections, in order: summary, key takeaways, full description, transcript (under a `## Transcript` heading), top comments (under `## Comments`). Drop sections you have no content for.
7. **Confirm.** Reply with the filename and a one-line note about anything missing (e.g. "no transcript available").
