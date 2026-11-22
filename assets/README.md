# Assets

The project's images: the logo, the demo that the project README shows, and the SVG files that documents use as `assets:name`.

## Logo

The logo is a robot with its jaw dropped open, yapping. The colored files use the accent colors of the web app's theme: `#3d4fd6` on light and `#8b9bff` on dark. The names say what each file has: `text` adds the name Yapparatus beside the robot, `animated` makes the robot blink and yap twice every 5 seconds, and `light` or `dark` is the background it is drawn for. The animation is CSS inside the SVG, and it stops when the reader prefers reduced motion.

| File | Use |
|---|---|
| `logo-text-animated-light.svg`, `logo-text-animated-dark.svg` | The project README |
| `logo-text-light.svg`, `logo-text-dark.svg` | Places where the logo with the name should not move |
| `logo-animated-light.svg`, `logo-animated-dark.svg` | The robot alone, 256 px, animated |
| `logo-light.svg`, `logo-dark.svg` | The robot alone, 256 px |
| `logo-icon.svg` | The line icon in `currentColor`, for a document's `logo` |
| `logo-favicon.svg` | The same drawing filled, with the eyes cut out, in `currentColor`: it stays readable at 16 px, for a document's `favicon` |

A document names a file here as `assets:name` for `assets/name.svg`. The design document and the test fixtures use `"logo": "assets:logo-icon"` and `"favicon": "assets:logo-favicon"` in `document.json`, and pages show `assets:gateway`. The logo files are generated from one drawing of the robot in `scripts/logo.ts`. To change the logo, edit the parts, colors, or animation there, and write the ten files again:

```sh
node scripts/logo.ts
```

Look at the files before committing them.

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
