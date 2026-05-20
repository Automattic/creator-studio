Import an X (Twitter) post as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

X serves a JavaScript-only shell to most clients, so expect partial data and
document what you could not get rather than guessing.

Steps:

1. **Fetch the post.** Use the `fetch_page` tool — do NOT use the shell,
   `curl`, `wget` or `python`. Try, in order, until one yields content:
    - `fetch_page` on the post URL above.
    - `fetch_page` on the X oembed endpoint
      `https://publish.twitter.com/oembed`, passing the post URL as the `url`
      query parameter (URL-encoded) plus `omit_script=1` — it returns JSON
      with the author and the post text.
      If neither yields the body, save what you know (the URL and the author
      handle from the path) and say you couldn't reach the post.
2. **Extract** the author display name + handle, the timestamp if present, and
   the full post text (preserve line breaks, keep links as-is).
3. **Summarize in your own words.** Two or three sentences on what the post is
   about and why it might be worth referencing later.
4. **Save the result.** Write a Markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the first ~6 words of the post (fallback:
      `tweet-source`), `.md`. On collision suffix `-2`, `-3`.
    - Frontmatter (YAML): `url`, `kind: tweet`, plus whichever of `author`,
      `handle`, `published`, `imported` you actually have.
    - Body: the summary, then the post text as a blockquote with the author
      and timestamp above it.
5. **Finish.** End your final message with a one-line `SUMMARY:` of what you
   saved and anything you couldn't fetch.
