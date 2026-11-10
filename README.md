# Yapparatus

A document you can talk to. Your coding agent writes it as MDX pages; you read it in the browser, select a passage or a diagram part, and ask. The agent answers in a chat panel, edits the document, or both.

This is an early implementation. Its design is a Yapparatus document in [`docs/design/`](docs/design/overview.mdx).

## Run

Requires Node.js 22.18+ and pnpm.

```sh
pnpm install
pnpm dev docs/design
```

This starts the design document. `pnpm dev tests/fixtures/content` starts the test document.

## Write a document

```sh
npx giget gh:tsaarni/yapparatus/starter my-document
cd my-document && pnpm install
```

Start your coding agent in that directory and ask for a document. When it is done, run `pnpm dev content`, open the address, and give the prompt the chat shows to the same agent session. Agents write pages by the [authoring guide](starter/docs/guide.md).

## Check

```sh
pnpm verify              # Biome, TypeScript, style rules
pnpm test:unit
pnpm test                # browser tests; first run: pnpm exec playwright install chromium
pnpm build docs/design   # static site in dist/docs/design/
```
