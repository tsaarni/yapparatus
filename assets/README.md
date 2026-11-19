# Assets

The logo and the screenshots that the project README shows.

## Screenshots

`screenshot-light.png` and `screenshot-dark.png` show the design document with the chat panel open: a question about an arrow of a sequence diagram, and the agent's reply. To take them again after the web app changes:

```sh
pnpm exec playwright install chromium   # once
pnpm screenshots
```

`scripts/screenshots.ts` writes both files in about 20 seconds. It leaves the chat of your own dev server alone:

1. It copies the project to a temporary folder and serves `docs/design` there on port 5180, with its own Vite cache.
2. In Chromium, it opens the chat, selects the arrow, and sends the question.
3. It acts as the agent through the agent library: it reads the message, waits 9 seconds so the reply shows a working time, and sends the reply. A second wait keeps the header at "Agent connected".
4. For each color scheme, it opens the page at 1440×900 with a device scale of 2, shows the referenced arrow, scrolls the figure to the top, and saves the screenshot.

The page, the figure, the arrow, the question, and the reply are constants at the top of the script. When the design document changes:

- If the page, the figure, or the element id is renamed, update `scene`.
- If the design changes what the reply says, update `reply` so it stays true to the document.

Look at both images before committing them.
