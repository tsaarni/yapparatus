import Send from "~icons/lucide/arrow-up";
import Check from "~icons/lucide/check";
import Previous from "~icons/lucide/chevron-left";
import Next from "~icons/lucide/chevron-right";
import Code from "~icons/lucide/code";
import Copy from "~icons/lucide/copy";
import Locate from "~icons/lucide/crosshair";
import More from "~icons/lucide/ellipsis";
import File from "~icons/lucide/file";
import Page from "~icons/lucide/file-text";
import Folder from "~icons/lucide/folder";
import Hash from "~icons/lucide/hash";
import Image from "~icons/lucide/image";
import Note from "~icons/lucide/info";
import Tip from "~icons/lucide/lightbulb";
import Link from "~icons/lucide/link";
import Expand from "~icons/lucide/maximize-2";
import Menu from "~icons/lucide/menu";
import Important from "~icons/lucide/message-square-exclamation-point";
import Comment from "~icons/lucide/message-square-text";
import Collapse from "~icons/lucide/minimize-2";
import System from "~icons/lucide/monitor";
import Dark from "~icons/lucide/moon";
import Caution from "~icons/lucide/octagon-exclamation-point";
import Light from "~icons/lucide/sun";
import Table from "~icons/lucide/table-2";
import Quote from "~icons/lucide/text-quote";
import Clear from "~icons/lucide/trash-2";
import Warning from "~icons/lucide/triangle-exclamation-point";
import Diagram from "~icons/lucide/workflow";
import Close from "~icons/lucide/x";
import { Icon } from "./icon.tsx";

/** The web app's own interface icons, from Lucide, by name. */
const appIcons = {
  caution: Caution,
  check: Check,
  clear: Clear,
  code: Code,
  close: Close,
  collapse: Collapse,
  comment: Comment,
  copy: Copy,
  dark: Dark,
  diagram: Diagram,
  expand: Expand,
  file: File,
  folder: Folder,
  hash: Hash,
  image: Image,
  important: Important,
  light: Light,
  link: Link,
  locate: Locate,
  menu: Menu,
  more: More,
  next: Next,
  note: Note,
  page: Page,
  previous: Previous,
  quote: Quote,
  send: Send,
  system: System,
  table: Table,
  tip: Tip,
  warning: Warning,
};
export type AppIconName = keyof typeof appIcons;
export function AppIcon({ name, size = 16 }: { name: AppIconName; size?: number }) {
  return <Icon icon={appIcons[name]} size={size} />;
}
