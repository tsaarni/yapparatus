import * as stylex from "@stylexjs/stylex";
import type { ComponentType, SVGProps } from "react";
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
import Ask from "~icons/lucide/message-square-text";
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

const styles = stylex.create({
  icon: (size: number, color: string) => ({
    width: size,
    height: size,
    flexShrink: 0,
    display: "inline-block",
    verticalAlign: "-0.15em",
    color,
  }),
});

export interface IconProps {
  /** MDX-only literal collection:name, resolved at build time. */
  name?: string;
  /** Imported ~icons component, for TSX and dynamic component references. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Width and height in px. Default: 20. */
  size?: number;
  /** Accessible name. Omit for decorative icons. */
  label?: string;
  /** CSS color. Default: inherit. Multicolor logos preserve their authored fills. */
  color?: string;
}

export function Icon({ icon: Svg, name, size = 20, label, color = "inherit" }: IconProps) {
  if (!Svg)
    throw new Error(
      `Icon ${name ?? ""} requires a literal name in MDX, or an imported icon component in TSX.`,
    );
  return (
    <Svg
      {...stylex.props(styles.icon(size, color))}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    />
  );
}

const appIcons = {
  ask: Ask,
  caution: Caution,
  check: Check,
  clear: Clear,
  code: Code,
  close: Close,
  collapse: Collapse,
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
