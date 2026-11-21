/** A fixed icon set for tests: three Lucide icons, so tests do not depend on the package. */
import type { IconSet } from "../../../src/diagram/metrics.ts";

const bodies = new Map([
  [
    "database",
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></g>',
  ],
  [
    "user",
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></g>',
  ],
  [
    "server",
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/></g>',
  ],
]);

/** Database, user, and server, with their Lucide bodies. */
export const fixedIcons: IconSet = {
  body: (name) => bodies.get(name),
  names: [...bodies.keys(), "database-backup", "database-zap", "users"],
};
