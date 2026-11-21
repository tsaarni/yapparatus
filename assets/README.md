# Assets

The logo and the demo that the project README shows.

## Demo

`demo-light.webp` and `demo-dark.webp` are animated WebP images that show the design document with the chat panel open. The reader selects an arrow of a sequence diagram, asks about it, and gets the agent's reply. Then the reader asks the agent to show the query parameters on the arrow, and the page updates in place. To record them again after the web app changes:

```sh
pnpm exec playwright install chromium   # once
pnpm demo
```

The script needs `ffmpeg` and `img2webp` on the `PATH` (`brew install ffmpeg webp`). `scripts/demo.ts` writes both files in about 80 seconds. It leaves the chat of your own dev server alone:

1. It copies the project to a temporary folder and serves `docs/design` there on port 5180, with its own Vite cache.
2. For each color scheme, it clears the chat, restores the page, opens it in Chromium at 1280×800 with the chat open, and starts recording with the browser's screencast. It draws a pointer on the page, since headless Chromium draws none.
3. It moves the pointer to the arrow, selects it, types the question, and sends it.
4. It acts as the agent through the agent library: it reads the message, waits 4 seconds so the reply shows a working time, and sends the reply. A second wait keeps the header at "Agent connected". It shows the referenced arrow on the page.
5. It asks for the change. As the agent, it reads the message, edits the page in the temporary folder, checks the document, and replies.
6. With ffmpeg, it scales the frames to 960 px wide at 12 frames per second, keeping their timing. With `img2webp`, it encodes them as a lossy WebP at quality 90, which keeps full color and is less than half the size of a GIF.

The page, the figure, the arrow, the question, the reply, and the change are constants at the top of the script. When the design document changes:

- If the page, the figure, or the element id is renamed, update `scene`.
- If the design changes what the reply says, update `reply` so it stays true to the document.
- If the arrow's label or the read's parameters change, update `change`; the script edits the page by replacing `change.from`.

Look at both images before committing them.
