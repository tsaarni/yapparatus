# Codebase documents

A codebase document explains how a repository works. This page says how to agree on its scope, how to study the code, how to arrange the pages, and which figures to draw. `docs/guide.md` gives the rules for writing pages, and the reference files give the syntax.

Contents: Agree on the scope · Study the code · Arrange the pages · Choose the figures · Draw code · Write about code

## Agree on the scope

Before you read the code in depth, agree on two things with the user in your session, unless the request already says them:

- **The reader.** A new contributor needs the structure and the main paths. A reviewer needs the part of the code that a change touches. An operator needs configuration, startup, and failure behavior.
- **The coverage.** The whole repository, or the subsystems and paths to explain. In a large repository, propose a list of pages and let the user shorten it.

Skim the README and the top-level directories first, so that your questions and your proposal name the real parts. Then write the agreed document in full.

## Study the code

Read selectively. Use the directory layout, the import graph, and a search for names to find the files that matter, and read those. Take notes with file paths and line numbers, because the pages link to them.

1. **Purpose and boundaries.** Read the README, the build files, and the dependency list. Find what the program does, who or what calls it, and what it calls: users, other services, databases, queues, files.
2. **Entry points.** Find where execution starts: `main`, HTTP or RPC handlers, CLI commands, event consumers, scheduled jobs.
3. **Modules.** List the top-level packages or directories, what each one owns, and which ones import which. The import graph shows the layers.
4. **Core types.** Find the few data types that most code passes around, and where they are created, changed, and stored.
5. **One path from start to end.** Follow the most common request or job from its entry point through each call to its result. Note where the data changes shape, where state is written, and where it can fail.
6. **Concurrency.** Find the threads, tasks, workers, or event loops, what each one runs, and what state they share and how they guard it.
7. **Configuration, lifecycle, and errors.** Find how the program is configured, started, and stopped, and follow the failure paths of the main path: retries, timeouts, validation, and recovery.

Tests show the intended behavior and give realistic inputs: read the tests of a part to see how it is used. The reasons behind the code are often in comments, design notes, and the README. When the text needs a reason that these do not give, look at the commit and pull request that introduced the lines in question. Read the history of specific lines only.

State only what the code or these sources show. When you infer something, say so in the text: "The cache is probably there to …".

## Arrange the pages

Go from the outside in, so that a reader who stops after any page has a correct, if coarse, picture:

1. **Overview.** What the program does, its context diagram, a map of its modules with one sentence each, and the commit or release the document describes.
2. **One page per subsystem.** What the subsystem owns, its directory, its parts, its main types, and how the rest of the program calls it.
3. **Walkthroughs.** One page or section per important path, such as "Handling a write request" or "Startup", that follows the path across subsystems.
4. **Data model.** The core types, tables, or messages, and how they relate.
5. **Terminology.** Terms specific to the codebase, each with a one-sentence meaning and a link to where it is explained.

A small repository puts the overview, subsystems, and data model on one page. Arrange pages by what the reader needs to understand. A page per directory or a tour of the files in order explains little: the reader can list the files without the document.

## Choose the figures

Every codebase document has a context diagram and a module map on its overview page, and a sequence diagram with steps for each walkthrough.

| The reader asks | Draw |
|---|---|
| What is around the program? | The program in the middle, with the users and systems it talks to around it |
| What are the parts? | Modules as shapes inside an enclosure for the program, with their dependencies as edges |
| What happens on a request? | A sequence with steps, in `docs/diagram-sequences.md` |
| What does the data look like? | Records with their fields, in `docs/diagram-structures.md` |
| How are the types related? | A class tree, in `docs/diagram-trees.md`, or records with edges for references |

For other questions, use "Pick a form" in `docs/diagrams.md`.

## Draw code

- **One level per diagram.** A diagram shows the system, the modules of one subsystem, or the calls inside one module. Show the next level in another diagram, on the page of that part, and link to it from the text.
- **About 12 elements.** Group elements in enclosures, leave out what the text does not discuss, or split the diagram by level.
- **Names from the code.** Label a module, type, or function with its name as written in the code, with `mono: true`, so the reader can search for it. Put a plain description in `sub` when the name does not explain itself.
- **One meaning for the edges.** Edges in one diagram are calls, data flow, or imports. Label each with what it carries or does, such as `Order` or `publish`.
- **The same part looks the same everywhere.** A module has the same label, shape, and role in every diagram that shows it.

## Write about code

- **Explain why, then what.** Say what a part is for and why it is shaped as it is. The excerpt shows the code, so the text does not repeat it line by line.
- **Excerpt where the code meets the idea.** Show the lines that the reader must see, such as a retry loop, a key data structure, or the place where two subsystems meet. Use a figure for structure and a link for everything else.
- **Correct the page when the code disagrees.** When a reader's comment shows that a page differs from the code, read the code again and fix the page as well as replying.
