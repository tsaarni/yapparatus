# Icons

## Use

```mdx
<Icon name="lucide:database" label="Database" />
<Icon name="selfhst:redis" size={28} label="Redis" />
<Icon name="local:gateway" size={24} label="Gateway" />
```

- `name` is a literal `collection:icon`. An unknown name fails compilation.
- `size` is pixels; default 20. `color` overrides the text color of a monochrome icon.
- Give `label` when the icon carries meaning; leave it out when the text beside it says the same.
- Diagram shapes take no icons.

## Collections

| Prefix | Use for |
|---|---|
| `lucide` | General technical symbols and actions. The default family |
| `selfhst` | Logos of real software and services, often with `-light` and `-dark` variants |
| `energy-icons` | Energy and engineering symbols |
| `local` | An SVG in `icons/`: `icons/gateway.svg` → `local:gateway` |

Use one family for ordinary symbols, and logos only for the actual product. When a document with `selfhst` logos is shared, credit selfh.st (CC BY 4.0).

## Find names

Search every installed collection from the project directory; replace `redis` with a word:

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
const { dependencies } = JSON.parse(readFileSync("package.json", "utf8"));
for (const pkg of Object.keys(dependencies).filter((name) => name.startsWith("@iconify-json/"))) {
  const { default: set } = await import(`${pkg}/icons.json`, { with: { type: "json" } });
  const names = Object.keys({ ...set.icons, ...set.aliases }).filter((name) => name.includes(process.argv[1]));
  if (names.length) console.log(`${set.prefix}: ${names.slice(0, 40).join(" ")}`);
}' redis
```

```text
selfhst: redis redis-dark redis-light
```

With web access, browse a collection at `https://icon-sets.iconify.design/<prefix>/`, such as [lucide](https://icon-sets.iconify.design/lucide/). Only installed collections compile; ask the user before adding one with `pnpm add @iconify-json/<prefix>`.

## Local SVGs

Put the file in `icons/` with a `viewBox`. Use `currentColor` for a monochrome icon so it follows the theme.

## In custom components

```tsx
import Database from "~icons/lucide/database";
import { Icon } from "yapparatus";

export function DatabaseLabel() {
  return <span><Icon icon={Database} size={20} /> Database</span>;
}
```
