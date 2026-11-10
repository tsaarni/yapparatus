# AGENTS.md

This directory is a Yapparatus project. Each document is a directory with a `document.json` and its pages; the first one is `content/`. Run `pnpm install` first if `node_modules/` is missing. The user starts a document with `pnpm dev <directory>`, such as `pnpm dev content`.

Write and edit the pages following [docs/guide.md](docs/guide.md). Read the reference for what you use before writing it:

- [docs/components.md](docs/components.md): every component, code marks, and custom components.
- [docs/diagrams.md](docs/diagrams.md): `<Diagram>` and `<Step>`, with an example for each common form.
- [docs/diagram-structures.md](docs/diagram-structures.md): tables, protocol headers, registers, arrays, and marked text.
- [docs/diagram-sequences.md](docs/diagram-sequences.md): messages over time.
- [docs/charts.md](docs/charts.md): `<Chart>`.
- [docs/icons.md](docs/icons.md): `<Icon>` and how to find icon names.
