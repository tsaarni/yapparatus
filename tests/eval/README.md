# Authoring benchmark

`scripts/authoring-eval.ts` measures how well a coding agent writes and revises a document when it has only what Yapparatus gives it: the starter project, its authoring guide in `starter/docs/`, and the prompts the server prints. Use it to test a change to the guide, the starter's `AGENTS.md`, the agent prompts in `src/server/prompt.ts`, or a diagnostic, before and after the change.

Run it only when the user asks. Each run starts real agent sessions, takes minutes, and costs money. It runs once by default; give `--runs N` only when the user asks for more.

The agent must not see how it is judged. It gets a copy of `starter/` and of `orders/` only, and Yapparatus from its package, which holds `src/`, `lib/`, and `docs/design/`. Keep this file, the scoring, and anything about the benchmark out of those, and keep `orders/` a plain service whose README describes only the service.

## What a run does

1. Makes a project from the starter in a temporary folder, with a copy of the sample service `orders/` next to it, and installs Yapparatus packed from this repository.
2. Starts `pnpm dev content` and sends the first reader message: "Write a short document about the order service in ../orders for engineers who are new to the team."
3. Starts a headless agent, `claude -p`, with the start prompt that the chat's Copy prompt button gives. It runs with `--safe-mode`, so no user settings, skills, or plugins load, and gets the starter's `AGENTS.md` as its project instructions. It knows nothing else.
4. After each reply, a reader in a browser sends the next follow-up, as a person would: it selects a target, comments on it, and sends.
   - **element**: clicks the first diagram element whose id contains `cache`, and asks which settings in `config.yaml` control it, as a table under the figure. Passes if that page gains a `Table`.
   - **lines**: selects the `retry` function in `worker.go` in the file view, and asks whether its jitter is explained, adding it if not. Passes if a page mentions jitter.
5. After the last reply, the harness reads the chat as another agent. That ends the agent's wait with "Another agent took over the chat", and the agent stops by itself, so its counts are complete.
6. Opens every page in the browser, so chart drawings are checked, reads the final diagnostics, and saves a picture of every diagram.

The browser stays open during the run, so errors that only a browser finds reach the agent as they would with a reader.

## Run it

```sh
node scripts/authoring-eval.ts --label before --ref HEAD                     # the starter at a git ref
node scripts/authoring-eval.ts --label after --port 5310                      # the working tree
node scripts/authoring-eval.ts --label after --runs 5                         # 5 runs in parallel
node scripts/authoring-eval.ts --summarize                                   # compare every label
```

| Option | Meaning | Default |
|---|---|---|
| `--label` | Name of the variant; runs are `<label>-1`, `<label>-2`, … | Required |
| `--ref` | Test the starter at this git ref instead of the working tree | Working tree |
| `--runs` | Runs in parallel | `1` |
| `--model` | The agent's model | `haiku` |
| `--port` | First dev server port; each run takes the next | `5300` |
| `--out` | Output folder | `yapparatus-authoring-eval` in the system temp folder |

Yapparatus is packed once per output folder, as `yapparatus-0.0.0.tgz`, and reused. Delete it after changing code under `src/`, or runs test the old code. `--ref` changes only the starter; the code is always the working tree's.

Haiku is the default: it is fast and inexpensive, and a run with both follow-ups takes about 3 minutes. A guide that Haiku follows well works for larger models too. Check a change that matters with `--model opus` as well.

## What a run leaves

Each run folder holds:

- `result.json`: the scores below.
- `transcript.jsonl`: the agent's stream, every tool call and result.
- `server.log`: the dev server's log at debug level.
- `prompt.txt`: the start prompt the agent got.
- `<page>--<figure>.png`: a picture of each diagram.
- `project/` and `orders/`: the workspace as the agent left it. Start it with `pnpm dev content` in `project/` to read the document.

`--summarize` prints the mean of each score for each label and model, one column each, such as `after (haiku-5-5)`. It reads the transcripts again, so a fix to the scoring applies to earlier runs, and the model comes from the transcript, so every run shows the model it ran on.

| Score | Meaning |
|---|---|
| model calls | Calls to the model; each one reads the whole conversation again, so this drives tokens and time |
| tool calls | The agent's actions: reads, writes, checks, pictures |
| output tokens | What the agent wrote, thinking included |
| input tokens processed | What the agent read: new input, cache writes, and cache reads |
| minutes | Wall time; it depends on the load of the machine |
| doc pages read | Pages of `docs/` the agent opened |
| checks run, diagnostics at first check | How many mistakes the agent made before the check caught them |
| final errors, final warnings | What the document still has; should be 0 |
| `<follow-up>: passed`, minutes, tool calls, checks | Each follow-up's outcome and what it took |
| uses … | How often each component and diagram form appears |
| rule: … | Writing rules a pattern finds broken: em dashes, typed numbers, "the table below", fences without a language |

## Judge the output

The scores find mistakes; they do not say whether the document is good. Read the document and the pictures of at least two runs per variant, and judge them on these points.

1. **Clean.** No final errors or warnings, and every figure reads well in its picture: no crowded labels, no edges through shapes, no figure wider than about 960 units.
2. **Each subject in its best form.** The sample service has one subject for most forms. A good document uses the form that fits each one:

   | Subject in `orders/` | Best form |
   |---|---|
   | API, cache, PostgreSQL, queue, worker, dead-letter queue | Component diagram with an enclosure for the process, with steps for a read and a write |
   | Order states and events in `internal/order` | State machine diagram with `start`, `bend` routes for opposite transitions, `loop` for `payment_failed` |
   | A payment event through the worker | Sequence diagram, `d.sequence`, with an `alt` fragment for retry and dead letter |
   | Tables in `schema.sql` | `d.record` tables with foreign keys as edges between rows |
   | The event header in `internal/wire` | `d.record` protocol header with `columns: 32` and a bit ruler |
   | Latency by concurrency in `bench/get-latency.csv` | `Chart` from the file: lines or bars by cache hit and miss, log scale for p99 |
   | Queue depth during the outage in `bench/queue-depth.csv` | `Chart` with time on x and a `ruleX` for the outage |
   | Backoff formula in `worker.go` | Math, `$$`, for the delay of attempt n |
   | Routes, configuration settings | `Table` |
   | Code the text explains | `Excerpt` of 5 to 30 lines, inside a `Listing` when numbered |
   | Repository layout | `FileTree` |
   | Traps, such as `payment_failed` that no code sends | One alert, only for what the reader must not miss |

   A form that is missing where it fits is a finding: no run so far has drawn a sequence diagram, although the worker flow is one.
3. **Steps where order matters.** Figures that show a flow, such as a request or a retry, have steps; static structures do not.
4. **Writing.** The guide's writing rules: plain sentences, one term for one thing, no hype, every numbered item has a caption and a `Ref` before or where it appears.
5. **Facts.** Every statement matches the code. Links to code point at the lines they describe.
6. **Follow-ups.** The agent edited the right page and place, answered the question in its reply, and linked to the change.

## Measure carefully

- **One run shows that an edit works; it does not measure it.** Runs of one variant vary: model and tool calls by about 30% of the mean on Haiku and 15% on Opus, and tokens by more. To compare variants, run each 5 times or more, and treat smaller differences as noise. Counts of runs, such as 1 of 5 against 3 of 5 runs that draw a chart, are noise at 5 runs.
- **Compare variants run the same way.** Run "before" and "after" on the same model: a column of Haiku next to a column of Opus shows the model, not the change. Runs in parallel share the machine, and load changes timing, such as how fast the file watcher reports a new file.
- **Count diagnostics from check results, not from the transcript text.** A transcript contains code names from the agent's own text and from earlier checks, so a search of it overcounts.
- **Read the transcripts.** The tool calls show where a run spent its turns, and the order of checks shows which mistakes cost a round. `server.log` shows what the server saw when a check gave a surprising result.

## What we learned

These held in the runs so far, on the order service task.

- **Count what the agent did, not what it cost.** The cost a run reports is a list price that caching moves from run to run, so the same work costs different amounts. Model calls, tool calls, and tokens show the work.
- **The docs' size hardly matters.** The guide and the pages an agent reads are about 20k tokens of roughly 1M tokens of context per run. Most of the context is the agent reading the code and its own drafts. Cutting the docs by a few percent changed no score.
- **Agents read what the task needs.** Every run read the guide, `components.md`, `diagrams.md`, `diagram-structures.md`, and `charts.md`. None opened `diagram-sequences.md` or `diagram-trees.md`, or the design documents.
- **Examples teach more than rules.** When the steps example used `const api = d.box("API")` with `focus="api"`, agents wrote variable names in `focus` in every run, even with a rule that ids come from labels. Changing the example so the variable and the id differ, `d.box("Orders API")` with `focus="orders-api"`, removed the error.
- **A rule repeated in the guide is followed.** Softening the guide's sentence about steps made agents stop using them; restoring it brought them back. Keep the guide's one-line pointers to features, even when the reference repeats them.
- **Mistakes caught at the first check cost little.** Agents fix every diagnostic of a check in one round, so an error that comes with others adds no round. Fix a diagnostic's cause only when it costs a round, or when it is a false error.
- **False errors cost trust.** A check run right after writing new pages reported them as missing, because Vite had not yet seen them; an agent called it "a timing issue" and moved on. The check now waits for the watcher. Watch for agents explaining an error away: it often means the error is wrong.
- **A reply needs a confirmation.** Before the reply command printed "Reply sent", agents whose wait ended early did not know whether the reader had their reply.
- **A product rule beats a doc rule for a common mistake.** A figure id equal to a heading id was an error in nearly every run, and a rule in the guide did not stop it. Letting the heading take a suffix removed the error and the rule.
