Import a URL as a new source for this project.

URL: {{url}}
Project: {{project}}
Imported on: {{importedAt}}

Plan the work as a checklist (use TodoWrite) and follow it:

1. **Fetch the page.** Use `WebFetch` first; if it fails or returns thin content, fall back to `curl -sL -A "Mozilla/5.0"` and parse the HTML yourself. If the page is paywalled, login-walled, or you can't retrieve it, say so plainly and stop — never fabricate.
2. **Extract metadata.** Aim for: title, author / byline, publication date, site name, content type (article, blog post, docs page, podcast, talk, …), reading time or word count if available, primary tags. Pull from `<meta>` (`og:*`, `article:*`, JSON-LD) before scraping body text.
3. **Summarize in your own words.** One paragraph (3–5 sentences) that captures what the piece argues or teaches — not the marketing tagline. Add 3–6 key points as a bullet list when the article supports it.
4. **Save the result.** Write a markdown file to `{{sourcesFolder}}/`:
    - Filename: kebab-case from the title (or hostname + path tail if no title), `.md` extension. On collision suffix `-2`, `-3`, etc.
    - Frontmatter (YAML): `title`, `url`, `kind: website`, plus whichever of `author`, `published`, `site`, `imported`, `tags` you actually found. Omit fields you don't have — never invent values.
    - Body: the summary paragraph, the bullet list of key points, then any notable quotes (max 3, blockquoted). Keep it tight; this is a reference card, not a re-publication.
5. **Confirm.** Reply with the filename, the kind, and a one-line note about anything you couldn't extract.
