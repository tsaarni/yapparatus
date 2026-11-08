# My document

A [Yapparatus](https://github.com/tsaarni/yapparatus) document: pages you read in the browser and ask your coding agent about.

## Create

Requires Node.js 22.18+ and pnpm.

```sh
npx giget gh:tsaarni/yapparatus/starter my-document
cd my-document
pnpm install
```

Put the directory where you like, for example next to the repository the document is about.

## Write

Start your coding agent in this directory and ask for the document:

```text
Write a document about the order service in ../orders.
```

`AGENTS.md` points the agent at the authoring guide. The agent writes `content/` and tells you to launch the document.

## Read and ask

```sh
pnpm dev                # or: pnpm dev --port 5180
```

Open the address it prints. The chat shows a prompt; give it to the same agent session. From then on, select anything in the document, ask, and the agent answers in the chat or edits the pages.

## Share

```sh
pnpm build              # dist/: a static site
pnpm build:single       # dist-single/index.html: one offline file
```

The chat lives in `.yapparatus/`, which is not part of a build. It holds your questions; keep it private.
