<h1>
  <img alt="Yapparatus" src="assets/logo-light.svg#gh-light-mode-only" height="64">
  <img alt="Yapparatus" src="assets/logo-dark.svg#gh-dark-mode-only" height="64">
</h1>

Yapparatus is a tool for documents that are written and revised in conversation with a coding agent. The agent writes the pages as [MDX](https://mdxjs.com/). In the browser, the document appears next to a chat where you can select any part of the document, such as text, a table, or a part of a diagram, and ask the agent about it or request changes. The agent answers in the chat, edits the pages, or both.

This is an early implementation. Its design is itself a Yapparatus document, in [`docs/design/`](docs/design/overview.mdx).

## Read the design document

You need Node.js 22.18 or later, and pnpm. Install the dependencies and start the design document:

```sh
pnpm install
pnpm dev docs/design
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in the browser.

The repository also has a test document, which you can start with `pnpm dev tests/fixtures/content`.

## Write a new document

A new document starts from the starter project. The [starter README](starter/README.md) describes how to create the project, ask the agent to write the document, read it and ask questions, and build it for readers.

## Screenshot

<img alt="The design document in the browser. An arrow of a sequence diagram is selected, and the chat panel shows the reader's question about it and the agent's answer." src="assets/screenshot-light.png#gh-light-mode-only">
<img alt="The design document in the browser. An arrow of a sequence diagram is selected, and the chat panel shows the reader's question about it and the agent's answer." src="assets/screenshot-dark.png#gh-dark-mode-only">
