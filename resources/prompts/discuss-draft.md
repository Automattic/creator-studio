I'd like a complete first draft of `{{file}}` (inside `{{project}}`). The file is an **outline / table of contents** — section headings, possibly with bullet notes underneath. Develop every section into finished prose in one pass, end to end. **Don't ask me anything along the way** — go to the end, save the file, and only stop to talk when the full draft is done.

Order of operations:

1. Read `{{file}}`. Note the section list and the voice/angle the existing material implies.
2. Glob the project for existing images you can use: `{{project}}/raw/**/*.{png,jpg,jpeg,gif,webp,svg}` and `{{project}}/drafts/**/*.{png,jpg,jpeg,gif,webp,svg}`. Read filenames and any sibling notes to understand what each image is. Don't fabricate URLs for stock photos you haven't been given.
3. Develop every section in order: replace the bullet/outline notes with finished prose. Keep every heading, in the same order. Don't invent new sections, don't delete existing ones.
4. While writing, place images where they actually help — typically a hero near the top, then in-section illustrations where the prose calls for one. Reference them with **relative markdown** so the preview can resolve them, e.g. `![alt](../raw/cover.png)` from inside a `drafts/<file>.md` (use `../raw/...` to step out of `drafts/`). If no images fit a section, skip it — don't pad. If the project has zero usable images, finish the draft text-only and say so at the end.
5. Save the file. Save once at the end is fine — the preview reloads automatically when your turn finishes.
6. Then, and only then, report back: a short bulleted list of what you did per section, which images you placed (and where they came from), and anything you deliberately left out. Ask me what to revise next.

Rules:

-   Match the tone the outline already establishes — casual / technical / playful — don't shift register.
-   If a section's bullets are too thin to develop confidently, write the best version you can from context and flag it in your final report rather than asking mid-flight.
-   If the file doesn't actually look like an outline (no headings, or already developed prose), say so up front and stop — don't guess what to do.
-   All image references must be relative paths to files that actually exist in this project. Never link to external URLs you can't verify.
