# AGENTS.md

Rules for agents working on this project.

## Where things are written

| Question | Read |
|---|---|
| How do I write or edit a document page? | [starter/docs/guide.md](starter/docs/guide.md) and its references |
| Why is it built this way? | [docs/design/](docs/design/overview.mdx), a Yapparatus document: `pnpm dev docs/design` |
| How do I run it? | [README.md](README.md) |

Follow the authoring guide when editing pages in `docs/design/` or `tests/fixtures/`. Follow the design documents when changing the reader, the diagram compiler, or the server. When a change settles a design question, update the design document in the same change; when it changes what authors write, update the guide too.

## Engineering

- **No backwards compatibility.** Change any API, format, or address when a better design appears; update every caller and document in the same change.
- **One way to do each thing.** Prefer an opinionated API with a single elegant, clear path over options and aliases.
- **Docs describe what exists.** The authoring reference covers only built features; agreed but unbuilt rules are marked **Direction** in design documents.

- `pnpm verify`, `pnpm test:unit`, and `pnpm test` pass before work is done; `pnpm api:report` when exports change.
- StyleX: longhand properties only (`borderWidth`, `backgroundColor`). Shorthands with theme variables are dropped silently; `pnpm verify` rejects them and literal colors.
- Keep semantic class names with `styled("name", …styles)`; spreading `stylex.props()` after `className` erases it.
- Every style value is a token from `src/reader/theme.stylex.ts`; components keep their own styles. A new value goes into the scale with a comment on what it is for. See [styling](docs/design/styling.mdx).
- The server API sorts messages by kind: commands (`POST`), reports (`PUT /-/api/diagnostics/{scope}`), events (`GET /-/api/events`), and reads (`GET`, which may wait). Types in `src/protocol.ts`; everything the agent reads is written in `src/server/prompt.ts`.
- Browser tests run in an isolated temporary workspace with their own Vite cache.
- `yapparatus/vite`, `yapparatus/agent`, and the `yap` command load from `lib/`, compiled by `pnpm build:lib`; `pnpm dev`, `pnpm build`, and `pnpm test` run it. A project installs this package, as `starter/` does: test a change to how it installs with `pnpm pack` into a copy of the starter.

## Writing

- **Write simple, direct technical English.** No filler words, marketing tone, em dashes in prose, or dramatic contrasts such as "not X, but Y". This covers code comments, commit messages, and READMEs; document pages also follow [the guide's writing rules](starter/docs/guide.md#writing).
