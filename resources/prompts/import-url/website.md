Import a URL as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

Steps:

1. **Fetch the page.** Call the `fetch_page` tool with the URL above — it
   returns the page's readable text. Do NOT use the shell, `curl`, `wget` or
   `python`. If the page is paywalled, login-walled, or comes back empty, say
   so plainly and stop — never fabricate content.
2. **Extract metadata** from the returned text: title, author / byline,
   publication date, site name, content type (article, blog post, docs page,
   talk, …). Use only what is actually present.
3. **Summarize in your own words.** One paragraph (3–5 sentences) that
   captures what the piece argues or teaches — not the marketing tagline. Add
   3–6 key points as a bullet list when the article supports it.
4. **Save the result.** Write a Markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the title (or the hostname + path tail), `.md`.
      On collision suffix `-2`, `-3`.
    - Frontmatter (YAML): `title`, `url`, `kind: website`, plus whichever of
      `author`, `published`, `site`, `imported` you actually found. Never
      invent values.
    - Body: the summary paragraph, the bullet list of key points, then up to
      3 notable quotes (blockquoted). Keep it tight — a reference card, not a
      re-publication.
5. **Finish.** End your final message with a one-line `SUMMARY:` of what you
   saved and anything you couldn't extract.
