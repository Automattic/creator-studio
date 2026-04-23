# pr-screenshots

Long-lived orphan branch that hosts screenshots referenced from PR
descriptions, so the main branch history stays binary-free.

## Layout

```
pr-<number>/
  <image>.png
  ...
```

One folder per PR. Images are referenced from the PR body via:

```
https://raw.githubusercontent.com/Automattic/creator-studio/pr-screenshots/pr-<number>/<image>.png
```

## Adding screenshots for a new PR

```sh
git fetch origin pr-screenshots
git worktree add /tmp/pr-screenshots origin/pr-screenshots
cd /tmp/pr-screenshots
mkdir -p pr-<number>
cp /path/to/*.png pr-<number>/
git add pr-<number>/
git commit -m "screenshots for PR #<number>"
git push origin HEAD:pr-screenshots
git worktree remove /tmp/pr-screenshots
```

Then reference in the PR body with the raw URL above.

## Why an orphan branch

- `main`/`trunk` stays free of binary assets.
- Merging PRs into `trunk` doesn't drag screenshots in.
- One branch for all PRs — no per-PR asset branch sprawl.
