# My document

This is a [Yapparatus](https://github.com/tsaarni/yapparatus) document, written and revised in conversation with a coding agent. The pages are in `content/`. The browser shows the document next to a chat with the agent, for questions about any part of it and requests for changes.

## Create

The document requires Node.js 22.18 or later, and pnpm or npm.

```sh
npx giget gh:tsaarni/yapparatus/starter my-document
cd my-document
pnpm install            # or: npm install
```

You can keep the directory anywhere, for example next to the repository that the document describes.

## Write

Start your coding agent in this directory and ask it to write the document:

```text
Write a document about the order service in ../orders.
```

`AGENTS.md` points the agent to the authoring guide. The agent writes the pages in `content/` and then tells you to start the document.

## Read and ask

```sh
pnpm dev content        # or: npm run dev content
```

`content` is the document's directory. The command prints an address. To use another port, add `--port 5180` with pnpm or `-- --port 5180` with npm.

Open the address in the browser. The chat shows a prompt. Give the prompt to the same agent session. After that, you can select any part of the document and ask about it. The agent answers in the chat or edits the pages.

## Share

```sh
pnpm build content          # or: npm run build content
pnpm build:single content   # or: npm run build:single content
```

`build` writes a static site to `dist/content/`. `build:single` writes the whole document to one offline file, `dist-single/content/index.html`.

The chat is stored in `.yapparatus/content/`, and no build includes it. It contains your questions, so keep it private.

## Add a document

The project can hold more documents. Each document is a directory with its own `document.json` and pages, for example `tutorial/`. Ask the agent to write the new document in that directory, then start it with `pnpm dev tutorial`. The documents share `docs/`, `icons/`, and `node_modules/`. One document directory cannot be inside another.

## Update

These commands install the latest Yapparatus and replace the authoring guide in `docs/` with the latest version:

```sh
pnpm add github:tsaarni/yapparatus      # or: npm install github:tsaarni/yapparatus
npx giget gh:tsaarni/yapparatus/starter/docs docs --force
```

The second command overwrites every file in `docs/`. It does not change the pages of your documents.
