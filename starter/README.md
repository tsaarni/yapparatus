# Starter Document

This is a [Yapparatus](https://github.com/tsaarni/yapparatus) document, written and revised in conversation with a coding agent. The agent writes the pages as [MDX](https://mdxjs.com/), with components for diagrams, charts, tables, code excerpts and more to make the document highly visual. In the browser, the document appears next to a chat where you can select any part of the document and ask the agent about it or request changes. The agent answers in the chat, edits the pages, or both.

## Create the project

You need Node.js 22.18 or later, and pnpm or npm. Create the project and install its dependencies:

```sh
npx giget gh:tsaarni/yapparatus/starter my-document
cd my-document
pnpm install            # or: npm install
```

The project directory can be anywhere, for example next to the repository that the document describes.

## Work with the document

Start the document with the name of its directory.
This starter project uses `content` as the default document directory:

```sh
pnpm dev content   # or: npm run dev content
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in the browser.

Start your coding agent. The chat has a button that copies a prompt for the agent. The prompt contains instructions and a short Node.js script that connects to the chat server. Paste the prompt into the agent's session, and the agent connects to the chat shortly after.

To have it write a document, ask for one, for example:

```text
Write a document about the order service in ../orders.
```

Select any part of the document as context and ask about it, and the agent answers in the chat or edits the pages.

The agent finds the authoring guide through `AGENTS.md`.
The chat is stored in `.yapparatus/` in the project directory. It holds your questions, so keep that directory private.

## Build the document for readers

To build standalone versions of the document, use the following commands:

```sh
pnpm build content          # or: npm run build content
pnpm build:single content   # or: npm run build:single content
```

`build` writes the document as a static site to `dist/content/`, and `build:single` writes it as one offline file, `dist-single/content/index.html`.

Neither build includes the chat.

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
