# AGENTS.md

Rules for agents working on this project.

## Where things are written

| Question | Read |
|---|---|
| How do I write or edit a document page? | [starter/docs/guide.md](starter/docs/guide.md) and its references |
| Why is it built this way? | [docs/design/](docs/design/overview.mdx), a Yapparatus document: `pnpm dev docs/design` |
| How do I run it? | [README.md](README.md) |
| How do I benchmark the guide or the agent prompts, when the user asks for it? | [tests/eval/README.md](tests/eval/README.md). Never run it unasked: it is slow and expensive |

Follow the authoring guide when editing pages in `docs/design/` or `tests/fixtures/`. Follow the design documents when changing the web app, the diagram compiler, or the server. When a change settles a design question, update the design document in the same change; when it changes what authors write, update the guide too.

Design documents state the design that the code implements. They name the design's concepts, data shapes, and API, and never the code: no links to source files, no file paths, no excerpts.

## Engineering

- **No backwards compatibility.** Change any API, format, or address when a better design appears; update every caller and document in the same change.
- **One way to do each thing.** Prefer an opinionated API with a single elegant, clear path over options and aliases.
- **Docs describe what exists.** Covers only built features; ideas that are not built start with `**[Direction](directions):**` in design documents and are listed in [docs/design/directions.mdx](docs/design/directions.mdx).

- `pnpm verify`, `pnpm test:unit`, and `pnpm test` pass before work is done; `pnpm api:report` when exports change.
- StyleX: longhand properties only (`borderWidth`, `backgroundColor`). Shorthands with theme variables are dropped silently; `pnpm verify` rejects them and literal colors.
- Keep semantic class names with `styled("name", …styles)` from `src/web/style/styled.ts`; spreading `stylex.props()` after `className` erases it.
- Every style value is a token from `src/web/style/theme.stylex.ts`; components keep their own styles. A new value goes into the scale with a comment on what it is for. See [styling](docs/design/styling.mdx).
- The server API is resources named after what the document is made of: `chat`, `diagnostics`, `files`. Methods mean what HTTP says, bodies are JSON, a read may wait (`wait=S`), and the browser and the agent use the same resources with parameters. Changes reach the browser on Vite's hot-update connection. Types in `src/protocol/rest-api.ts`, built from the document's types in `src/document/`; everything the agent reads is written in `src/server/prompt.ts`.
- Browser tests run in an isolated temporary workspace with their own Vite cache.
- `yapparatus/vite`, `yapparatus/agent`, and the `yap` command load from `lib/`, compiled by `pnpm build:lib`; `pnpm dev`, `pnpm build`, and `pnpm test` run it. A project installs this package, as `starter/` does: test a change to how it installs with `pnpm pack` into a copy of the starter.

## Code layout

Each directory under `src/` has one runtime: pure (no DOM, no Node), node, or browser. A directory imports only what its row allows, type-only imports included. Its `tsconfig.json` sets the runtime's `lib` and `types` and references exactly these directories, so `tsc -b` in `pnpm verify` rejects anything else. Code that two runtimes share goes in a pure directory.

| Directory | Runtime | May import |
|---|---|---|
| `document/` | pure | nothing |
| `protocol/`, `diagram/` | pure | `document` |
| `chart/` | pure | `document`, `diagram` |
| `compiler/` | node | all pure |
| `server/` | node | `compiler`, all pure |
| `agent/` | node | `protocol`, `document` |
| `vite/` | node | `compiler`, `server`, all pure |
| `web/` | browser | all pure |

Unit tests mirror the tree in `tests/unit/<directory>/`; browser tests are in `tests/browser/`.

File names:

- Lowercase, with dashes between words. Dots only for suffixes a tool requires: `.stylex.ts`, `.test.ts`, `.spec.ts`, `.d.ts`.
- A file is named after the one thing it defines, as a noun: `file-view.tsx` exports `FileView`. No bucket files such as `utils.ts`.
- The directory gives the role and the file the subject: no `-plugin` or `-resource` suffixes.
- Singular for one concept (`diagnostic.ts`), plural for a set of like things (`formats.ts`).
- Relative imports with `.ts`/`.tsx` extensions, no path aliases, no barrel files. Only the published entries re-export: `web/index.ts`, `agent/index.ts`, `vite/plugin.ts`.

## Writing

- **Write simple, direct technical English.** No filler words, marketing tone, em dashes in prose, or dramatic contrasts such as "not X, but Y". This covers code comments, commit messages, and READMEs; document pages also follow [the guide's writing rules](starter/docs/guide.md#writing).
- **Comments are short doc comments on files and declarations.** Each file starts with a `/** */` comment on what it holds, and each top-level function and class and each exported type and const has one. A comment has at most 2 lines and 100 columns, and no comment goes inside a function: name the code so it needs none. `pnpm verify` runs `scripts/check-comments.ts`, which enforces this.
