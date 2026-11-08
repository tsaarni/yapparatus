/**
 * The one number series of the agent channel: reader messages, replies, clears, and errors
 * each take the next number. The agent's cursor is a number in this series. The counter is
 * kept in a file, because errors are not stored with the messages: after a restart, a number
 * must never be used twice, or a waiting agent's cursor would hide what comes next.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export class Sequence {
  private value: number;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    const stored = existsSync(file) ? Number(readFileSync(file, "utf8").trim()) : 0;
    this.value = Number.isInteger(stored) ? stored : 0;
  }

  /** Never number below `floor`, such as the newest number a stored log holds. */
  raiseTo(floor: number) {
    this.value = Math.max(this.value, floor);
  }

  /** The newest number taken. */
  get current(): number {
    return this.value;
  }

  /** Take the next number. A crash before it is used only leaves a gap. */
  next(): number {
    this.value += 1;
    writeFileSync(this.file, `${this.value}\n`);
    return this.value;
  }
}
