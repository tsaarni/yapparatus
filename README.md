<h1>
  <img alt="Yapparatus" src="assets/logo-light.svg#gh-light-mode-only" height="64">
  <img alt="Yapparatus" src="assets/logo-dark.svg#gh-dark-mode-only" height="64">
</h1>

Yapparatus is a tool for creating documents that are written and revised in conversation with a coding agent. The agent writes the pages as [MDX](https://mdxjs.com/), with components for diagrams, charts, tables, code excerpts and more to make the document highly visual. In the browser, the document appears next to a chat where you can select any part of the document and ask the agent about it or request changes. The agent answers in the chat, edits the pages, or both.

Any coding agent that can run shell commands works. The agent does not need MCP support or configuration: you paste a prompt from the chat into the agent's session, and the agent connects to the chat server with short Node.js scripts.

## Write a new document

The [starter README](starter/README.md) describes how to create a new project, ask the agent to write the document, work with it, and build a standalone version for readers.

## Example

The design document of the project itself is a Yapparatus document. See [`docs/design/`](docs/design/overview.mdx).
You need Node.js 22.18 or later, and pnpm or npm. Install the dependencies and start:

```sh
pnpm install
pnpm dev docs/design
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in the browser.

In this screenshot, the document is shown with the chat panel open. An arrow of a sequence diagram is selected, and the chat the reader's question about it and the agent's answer.

<img src="assets/screenshot-light.png#gh-light-mode-only">
<img src="assets/screenshot-dark.png#gh-dark-mode-only">

The project also has a [test document](tests/fixtures/content), which you can start with `pnpm dev tests/fixtures/content`.
