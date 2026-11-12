# Alchemy docs

The Alchemy documentation site, built with [Mintlify](https://mintlify.com). Same setup as the Filament docs.

## Run locally

From the repo root:

```sh
just docs
```

This installs dependencies on first run and serves the site at http://localhost:3000.

## Checks

```sh
cd docs
pnpm validate   # build check
pnpm check      # broken links
```

## Adding a page

1. Create an `.mdx` file under `pages/` with `title` and `description` frontmatter.
2. Add its path (without `.mdx`) to `navigation` in `docs.json`.
3. Run `pnpm check` before opening a PR.

Prose avoids semicolons and colons and keeps sentences tight.
