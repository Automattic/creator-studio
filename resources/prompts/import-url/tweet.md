Import an X (Twitter) post as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

X aggressively blocks scrapers and serves a JS-only shell to most clients. Expect partial data and document what you couldn't get rather than guessing.

Plan the work as a checklist (use TodoWrite) and follow it:

1. **Try to fetch the post.**
    - `WebFetch` first.
    - If it returns nothing useful, `curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"` for OG-tag scraping.
    - Try the `https://publish.twitter.com/oembed?url=…` endpoint as a fallback — it returns a JSON blob with the author and the post HTML.
    - If none yield content, save what you do know (URL, author handle from the path) and tell me you couldn't reach the body.
2. **Detect a thread.** If the URL points to one tweet but the author has follow-ups in the same conversation, capture those too in order. If you can't determine thread membership, stick to the single post.
3. **Extract per tweet:**
    - Author display name + handle
    - Post timestamp
    - Full text (preserve line breaks; keep links as-is)
    - Reply / repost / like / view counts when surfaced
    - URLs of any embedded images or videos (URLs only — don't try to download)
    - Quoted tweet, if any (capture its author and text the same way)
4. **Summarize in your own words.** Two or three sentences on what the post (or thread) is about and why it might be worth referencing later.
5. **Save the result.** Write a markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the first ~6 words of the post (fallback: `tweet-<author>-<id>`), `.md`. On collision suffix `-2`, `-3`.
    - Frontmatter (YAML): `url`, `kind: tweet`, plus whichever of `author`, `handle`, `published`, `imported`, `replies`, `reposts`, `likes`, `views` you actually have. Add `thread: true` if you captured more than one tweet.
    - Body: the summary, then each tweet rendered as a blockquote with author + timestamp above it, separated by `---` between thread entries. Embedded media URLs go after the tweet they belong to.
6. **Confirm.** Reply with the filename and a frank one-liner about what you couldn't fetch (e.g. "metrics unavailable — page returned the JS shell").
