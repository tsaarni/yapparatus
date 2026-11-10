# My document

This is a [Yapparatus](https://github.com/tsaarni/yapparatus) document, written and revised in conversation with a coding agent. Its pages are in `content/`. In the browser, the document appears next to a chat where you can ask the agent about any part of it or request changes.

## Create the project

You need Node.js 22.18 or later, and pnpm or npm. Create the project and install its dependencies:

```sh
npx giget gh:tsaarni/yapparatus/starter my-document
cd my-document
pnpm install            # or: npm install
```

The project directory can be anywhere, for example next to the repository that the document describes.

## Ask the agent to write the document

Start your coding agent in the project directory and ask it to write the document:

```text
Write a document about the order service in ../orders.
```

The agent finds the authoring guide through `AGENTS.md`, writes the pages in `content/`, and then tells you how to start the document.

## Read the document and ask questions

Start the document with the name of its directory, `content`:

```sh
pnpm dev content        # or: npm run dev content
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in the browser. To choose the port, add `--port 5180` with pnpm or `-- --port 5180` with npm.

The chat shows a prompt for your agent: paste it into the same agent session that wrote the document, and the agent starts answering the chat. You can then select any part of the document and ask about it, and the agent answers in the chat or edits the pages.

## Build the document for readers

```sh
pnpm build content          # or: npm run build content
pnpm build:single content   # or: npm run build:single content
```

`build` writes the document as a static site to `dist/content/`, and `build:single` writes it as one offline file, `dist-single/content/index.html`.

Neither build includes the chat, which is stored in `.yapparatus/content/`. The chat contains your questions, so keep it private.

## Add another document

A project can hold more than one document. Each document is a directory with its own `document.json` and pages, and all documents share `docs/`, `icons/`, and `node_modules/`. A document directory cannot be inside another one.

To add a document, for example in `tutorial/`, ask the agent to write it in that directory, and then start it with `pnpm dev tutorial`.

## Update Yapparatus and the authoring guide

Run these commands to install the latest Yapparatus and the latest authoring guide:

```sh
pnpm add github:tsaarni/yapparatus      # or: npm install github:tsaarni/yapparatus
npx giget gh:tsaarni/yapparatus/starter/docs docs --force
```

The second command overwrites every file in `docs/` and leaves the pages of your documents unchanged.
