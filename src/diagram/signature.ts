/**
 * What a call takes: its arguments and options with the values of each, and the one check that
 * reports what disagrees with them and gives the value to use in its place.
 */
import type { DiagnosticCode } from "../document/diagnostic.ts";
import { editDistance } from "./edit-distance.ts";
import {
  Edge,
  Enclosure,
  Frame,
  Grid,
  type Named,
  Node,
  Point,
  type Reporter,
} from "./elements.ts";

/** A value that one of a list of values can be. */
type Literal = string | number | boolean;

/** What an element argument may be: a shape, a grid, a row, a column, an enclosure, or a frame. */
export type ElementKind = "shape" | "grid" | "enclosure" | "frame";

/** What stands in for a value that is rejected, and the sentence that says so. */
interface StandIn {
  value: unknown;
  says: string;
}

/** How a message names a value, alone and in a list, and what stands in for it. */
interface Described {
  readonly noun: string;
  readonly nouns: string;
  readonly standIn?: StandIn;
}

/** One of a list of literals, such as a role. */
interface OneOf extends Described {
  kind: "oneOf";
  values: readonly Literal[];
}

/** A finite number, whole when `whole`, from `min` to `max` when they are given. */
interface NumberValue extends Described {
  kind: "number";
  min?: number;
  max?: number;
  whole: boolean;
}

/** Text, `true` or `false`, a function, or `null` for an empty grid cell. */
interface Plain extends Described {
  kind: "text" | "boolean" | "function" | "empty";
}

/** A point, or an element or `[x, y]`, which stand for points. */
interface PointValue extends Described {
  kind: "point";
}

/** An element of the given kinds. */
interface ElementValue extends Described {
  kind: "element";
  of: readonly ElementKind[];
  /** Set when the element must be one of an earlier argument's, such as a participant. */
  among?: Among;
}

/** An earlier argument whose elements an element must be one of, and the code when it is not. */
interface Among {
  arg: string;
  noun: string;
  code: DiagnosticCode;
}

/** A list of values, or an object whose keys the author names, each with a value. */
interface Collection extends Described {
  kind: "list" | "names";
  readonly of: Value;
}

/** A list of fixed length, with a value for each place, such as `[x, y]`. */
interface Tuple extends Described {
  kind: "tuple";
  of: readonly Value[];
}

/** Any one of several values; the first that fits is used. */
interface Either extends Described {
  kind: "either";
  of: readonly Value[];
}

/** An object of options, such as a call's last argument or a sequence message. */
export interface Options extends Described {
  kind: "options";
  /** Each option's name and the values it takes. */
  options: Readonly<Record<string, Value>>;
  /** The options that must be given. */
  required: readonly string[];
  /** The options that name a form, each with the options only that form takes. */
  forms?: Forms;
  /** The option that tells this object from the others a list takes, such as `from`. */
  tag?: string;
}

/** The forms of an object: each form key with the options only it takes, and whether one is due. */
export interface Forms {
  keys: Readonly<Record<string, readonly string[]>>;
  required: boolean;
}

/** A statement of the values that an argument or an option takes. */
export type Value =
  | OneOf
  | NumberValue
  | Plain
  | PointValue
  | ElementValue
  | Collection
  | Tuple
  | Either
  | Options;

/** One argument of a call: its name, what it takes, and what is used when it is not given. */
export interface Argument {
  name: string;
  takes: Value;
  /** Set for an optional argument: the value used when it is not given or is rejected. */
  fallback?: { value: unknown };
  /** What the call does when the argument is rejected and nothing stands in for it. */
  otherwise?: string;
}

/** A call's statement: its name, which starts each message, and its arguments in order. */
export interface Signature {
  name: string;
  args: readonly Argument[];
}

/** The options of `T`, each with the values it takes. */
type Takes<T> = { [K in keyof Required<T>]: Value };

/** `T` with no key besides those of `Shape`, so a statement cannot name an option a type lacks. */
type Exactly<Shape, T> = T & Record<Exclude<keyof T, keyof Shape>, never>;

/** Join words as a list in a sentence: `a, b, or c`. */
function joinOr(words: readonly string[]): string {
  if (words.length <= 2) return words.join(" or ");
  return `${words.slice(0, -1).join(", ")}, or ${words.at(-1)}`;
}

/**
 * One of the given literals, which must be every value of `T`, so that a statement and its type
 * list the same values: `oneOf<Role>()("default", …)`.
 */
export function oneOf<T extends Literal>() {
  return <const V extends readonly T[]>(
    ...values: V & ([Exclude<T, V[number]>] extends [never] ? unknown : never)
  ): Value => {
    const noun = joinOr(values.map((v) => JSON.stringify(v)));
    return { kind: "oneOf", values, noun, nouns: noun };
  };
}

/** A finite number, whole when `whole`, from `min` to `max` when they are given. */
export function number(range: { min?: number; max?: number; whole?: boolean } = {}): Value {
  const { min, max, whole = false } = range;
  const bounds =
    min !== undefined && max !== undefined
      ? ` from ${min} to ${max}`
      : min !== undefined
        ? ` of ${min} or more`
        : max !== undefined
          ? ` of ${max} or less`
          : "";
  const kind = whole ? "whole number" : "number";
  return {
    kind: "number",
    whole,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    noun: `a ${kind}${bounds}`,
    nouns: `${kind}s${bounds}`,
  };
}

/** Text, such as a label. */
export const text: Value = { kind: "text", noun: "text", nouns: "texts" };
/** `true` or `false`. */
export const boolean: Value = { kind: "boolean", noun: "true or false", nouns: "true or false" };
/** A function, such as a ruler's labels. */
export const fn: Value = { kind: "function", noun: "a function", nouns: "functions" };
/** `null`: an empty cell of a grid. */
export const empty: Value = { kind: "empty", noun: "null", nouns: "null" };
/** A point, or an element or `[x, y]`, which stand for points. */
export const point: Value = {
  kind: "point",
  noun: "a point, a shape, a grid, an enclosure, a frame, or [x, y]",
  nouns: "points, shapes, grids, enclosures, frames, or [x, y]",
};

/** An element of the given kinds. */
export function element(...of: ElementKind[]): Value {
  return {
    kind: "element",
    of,
    noun: joinOr(of.map((k) => elementNoun[k])),
    nouns: joinOr(of.map((k) => elementNouns[k])),
  };
}

/** How a message names one element of a kind. */
const elementNoun = {
  shape: "a shape",
  grid: "a grid",
  enclosure: "an enclosure",
  frame: "a frame",
};
/** How a message names elements of a kind. */
const elementNouns = { shape: "shapes", grid: "grids", enclosure: "enclosures", frame: "frames" };

/** An element that must be one of the elements an earlier argument lists. */
export function among(of: ElementKind, among: Among): Value {
  return { ...(element(of) as ElementValue), among };
}

/** A list of values. A list that holds itself gives `of` as a function, with its noun. */
export function list(of: Value | (() => Value), noun?: string): Value {
  const item = typeof of === "function" ? of : () => of;
  return {
    kind: "list",
    get of() {
      return item();
    },
    noun: noun ?? `a list of ${item().nouns}`,
    nouns: "lists",
  };
}

/** A list of fixed length, with a value for each place, written in messages as `noun`. */
export function tuple(noun: string, ...of: Value[]): Value {
  return { kind: "tuple", of, noun, nouns: noun };
}

/** An object whose keys the author names, each with a value, such as a text's marks. */
export function names(of: Value, noun: string): Value {
  return { kind: "names", of, noun, nouns: noun };
}

/** Any one of several values. */
export function either(...of: Value[]): Value {
  return {
    kind: "either",
    of,
    noun: joinOr(of.flatMap((v) => parts(v, false))),
    nouns: joinOr(of.flatMap((v) => parts(v, true))),
  };
}

/** The words a message lists for a value, so that a list of lists reads as one list. */
function parts(value: Value, plural: boolean): string[] {
  if (value.kind === "oneOf") return value.values.map((v) => JSON.stringify(v));
  if (value.kind === "element")
    return value.of.map((k) => (plural ? elementNouns : elementNoun)[k]);
  if (value.kind === "either") return value.of.flatMap((v) => parts(v, plural));
  return [plural ? value.nouns : value.noun];
}

/** A value that stands in for itself when it is rejected, with the sentence that says so. */
export function standIn(value: Value, stand: unknown, says: string): Value {
  const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(value));
  return Object.assign(copy, { standIn: { value: stand, says } }) as Value;
}

/**
 * The options of `T`. The compiler rejects a statement that leaves out an option of `T` or names
 * one that `T` lacks, so the statements and the option types cannot drift apart.
 */
export function options<T>() {
  return <S extends Takes<T>>(
    takes: Exactly<Takes<T>, S>,
    more: {
      required?: readonly (keyof T & string)[];
      forms?: Forms;
      tag?: keyof T & string;
      noun?: string;
    } = {},
  ): Options => {
    const noun = more.noun ?? `{ ${Object.keys(takes).join(", ")} }`;
    return {
      kind: "options",
      options: takes,
      required: more.required ?? [],
      ...(more.forms ? { forms: more.forms } : {}),
      ...(more.tag ? { tag: more.tag } : {}),
      noun,
      nouns: noun,
    };
  };
}

/** A required argument; `otherwise` says what the call does when nothing stands in for it. */
export function arg(name: string, takes: Value, otherwise?: string): Argument {
  return { name, takes, ...(otherwise !== undefined ? { otherwise } : {}) };
}

/** An optional argument, with the value used when it is not given, and as for `arg`. */
export function optional(name: string, takes: Value, value: unknown, otherwise?: string): Argument {
  return { name, takes, fallback: { value }, ...(otherwise !== undefined ? { otherwise } : {}) };
}

/**
 * A value as a message quotes it: an element by its id and kind, text and numbers as written,
 * a list by its length, and an object by its keys, so that a misspelled option shows.
 */
export function quote(value: unknown): string {
  if (value instanceof Node) return value.id;
  if (value instanceof Grid) return `${value.id}, a ${value.kind}`;
  if (value instanceof Enclosure) return `${value.id}, an enclosure`;
  if (value instanceof Frame) return `${value.id}, a frame`;
  if (value instanceof Edge) return `${value.id}, an edge`;
  if (value instanceof Point) return "a point";
  if (Array.isArray(value)) return `a list of ${value.length}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "a function";
  if (value === null || typeof value !== "object") return String(value);
  const keys = Object.keys(value);
  return keys.length ? `{ ${keys.join(", ")} }` : "{}";
}

/** Whether a value is something a diagnostic can name by its id. */
export function isNamed(value: unknown): value is Named {
  return (
    value instanceof Node ||
    value instanceof Grid ||
    value instanceof Enclosure ||
    value instanceof Edge ||
    value instanceof Frame
  );
}

/** Whether a value is a plain object of options: not a list, an element, or a point. */
function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isNamed(value) &&
    !(value instanceof Point)
  );
}

/** Whether a value is of a kind of element. */
function isElement(value: unknown, of: readonly ElementKind[]): boolean {
  return (
    (value instanceof Node && of.includes("shape")) ||
    (value instanceof Grid && of.includes("grid")) ||
    (value instanceof Enclosure && of.includes("enclosure")) ||
    (value instanceof Frame && of.includes("frame"))
  );
}

/** Whether a value that is not a list or an object is one that `takes` takes. */
function accepts(takes: Value, value: unknown): boolean {
  switch (takes.kind) {
    case "oneOf":
      return takes.values.includes(value as Literal);
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (!takes.whole || Number.isInteger(value)) &&
        (takes.min === undefined || value >= takes.min) &&
        (takes.max === undefined || value <= takes.max)
      );
    case "text":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "function":
      return typeof value === "function";
    case "empty":
      return value === null;
    case "point":
      return (
        value instanceof Point ||
        isElement(value, ["shape", "grid", "enclosure", "frame"]) ||
        (Array.isArray(value) &&
          value.length === 2 &&
          value.every((n) => typeof n === "number" && Number.isFinite(n)))
      );
    case "element":
      return isElement(value, takes.of);
    default:
      return false;
  }
}

/** Whether a value looks like one `takes` takes, so that its own problems are the ones told. */
function resembles(takes: Value, value: unknown): boolean {
  switch (takes.kind) {
    case "options":
      return isObject(value) && (takes.tag === undefined || takes.tag in value);
    case "names":
      return isObject(value);
    case "list":
      return Array.isArray(value);
    case "tuple":
      return (
        Array.isArray(value) &&
        value.length === takes.of.length &&
        takes.of.every((of, i) => resembles(of, value[i]))
      );
    case "either":
      return takes.of.some((of) => resembles(of, value));
    case "oneOf":
      return takes.values.some((v) => typeof v === typeof value);
    case "number":
      return typeof value === "number";
    case "point":
      return value instanceof Point || isNamed(value) || Array.isArray(value);
    case "element":
      return isNamed(value);
    default:
      return accepts(takes, value);
  }
}

/** Whether a value is made of other values, whose problems a message names one by one. */
function structured(takes: Value): boolean {
  return ["options", "names", "list", "tuple", "either"].includes(takes.kind);
}

/** A value that was rejected, with nothing to stand in for it. */
const rejected = Symbol("rejected");

/** Where a value is checked: its path, for messages and subjects, and what its rejection does. */
interface At {
  path: string;
  otherwise: string;
}

/** A problem a call found, written once the call has made its element. */
interface Problem {
  code: DiagnosticCode;
  subject: string;
  given: unknown;
  message: () => string;
}

/** The sentence that follows an option that is ignored, so its default applies. */
const ignored = "It is ignored.";

/**
 * The check of one call against its signature. It collects the problems it finds, and `done`
 * reports them about the call's element once the call has made it.
 */
export class CallCheck {
  readonly #report: Reporter;
  readonly #signature: Signature;
  readonly #problems: Problem[] = [];
  /** The arguments checked so far, by name, which an `among` value looks in. */
  readonly #args = new Map<string, unknown>();
  /** The path of each object this check gave, so a call can name it in a later problem. */
  readonly #paths = new WeakMap<object, string>();
  constructor(report: Reporter, signature: Signature) {
    this.#report = report;
    this.#signature = signature;
  }

  /** The arguments to use, each checked; a missing optional one is its fallback, checked too. */
  args(given: readonly unknown[]): unknown[] {
    return this.#signature.args.map((arg, i) => {
      const value = given[i];
      const path = arg.name === "options" ? "" : arg.name;
      const otherwise = arg.otherwise ?? (arg.fallback ? ignored : "");
      const used = value === undefined && arg.fallback ? arg.fallback.value : value;
      const checked = this.#check(arg.takes, used, { path, otherwise });
      const result = checked === rejected ? arg.fallback?.value : checked;
      this.#args.set(arg.name, result);
      return result;
    });
  }

  /** The path of an object this check gave, such as `steps[2]`. */
  pathOf(value: object): string {
    return this.#paths.get(value) ?? "";
  }

  /** Report a value that the call takes but that has no effect here, and why. */
  ignore(path: string, given: unknown, why: () => string) {
    this.#problem("INVALID_ARGUMENT", path, given, () => `${why()} ${ignored}`);
  }

  /** Report a value that the call cannot use in its form; `why` says what stands in for it. */
  replace(path: string, given: unknown, why: () => string) {
    this.#problem("INVALID_ARGUMENT", path, given, why);
  }

  /** Record a problem, which `done` reports. */
  #problem(code: DiagnosticCode, subject: string, given: unknown, message: () => string) {
    this.#problems.push({ code, subject, given, message });
  }

  /**
   * Report the problems about `self`, the elements the call made, and `also`, with any element
   * a problem is about. Each message starts with the call's name and the ids of `self`.
   */
  done(self: readonly Named[] = [], also: readonly Named[] = []) {
    const name = this.#signature.name;
    for (const { code, subject, given, message } of this.#problems) {
      const about = [...self, ...also];
      if (isNamed(given) && !about.includes(given)) about.push(given);
      const prefix = () => (self.length ? `${name} ${self.map((el) => el.id).join(", ")}` : name);
      this.#report(code, about, () => `${prefix()}: ${message()}`, subject);
    }
  }

  #check(takes: Value, given: unknown, at: At): unknown {
    switch (takes.kind) {
      case "options":
        return this.#options(takes, given, at);
      case "list":
        if (!Array.isArray(given)) return this.#reject(takes, given, at);
        return Array.from(given, (item: unknown, i) => {
          const path = `${at.path}[${i}]`;
          return this.#check(takes.of, item, { path, otherwise: `${path} is left out.` });
        }).filter((value) => value !== rejected);
      case "tuple": {
        if (!Array.isArray(given) || given.length !== takes.of.length)
          return this.#reject(takes, given, at);
        const values = takes.of.map((of, i) =>
          this.#check(of, given[i], { path: `${at.path}[${i}]`, otherwise: at.otherwise }),
        );
        return values.includes(rejected) ? rejected : values;
      }
      case "names": {
        if (!isObject(given)) return this.#reject(takes, given, at);
        const entries = Object.entries(given).flatMap(([key, item]) => {
          const path = join(at.path, key);
          const value = this.#check(takes.of, item, { path, otherwise: `${path} is left out.` });
          return value === rejected ? [] : [[key, value]];
        });
        return Object.fromEntries(entries);
      }
      case "either": {
        const fits = takes.of.find((of) => this.#fits(of, given));
        if (fits) return this.#check(fits, given, at);
        const near = takes.of.find((of) => structured(of) && resembles(of, given));
        if (near) return this.#check(near, given, at);
        return this.#reject(takes, given, at);
      }
      case "element":
        if (!accepts(takes, given)) return this.#reject(takes, given, at);
        return takes.among ? this.#among(takes.among, given, at) : given;
      default:
        return accepts(takes, given) ? given : this.#reject(takes, given, at);
    }
  }

  /** The element when it is one of the argument's elements; otherwise it is reported. */
  #among(among: Among, given: unknown, at: At): unknown {
    const all = this.#args.get(among.arg);
    const elements: Named[] = Array.isArray(all) ? all.filter(isNamed) : [];
    if (elements.includes(given as Named)) return given;
    this.#problem(
      among.code,
      at.path,
      given,
      () =>
        `${at.path} is ${quote(given)}, which is not a ${among.noun}. ${at.otherwise} The ${among.noun}s are ${elements.map((el) => el.id).join(", ") || "none"}: add it to them, or name one of them.`,
    );
    return rejected;
  }

  /** Whether a value passes `takes` with no problem. */
  #fits(takes: Value, given: unknown): boolean {
    const trial = new CallCheck(this.#report, this.#signature);
    for (const [name, value] of this.#args) trial.#args.set(name, value);
    trial.#check(takes, given, { path: "", otherwise: "" });
    return trial.#problems.length === 0;
  }

  #options(takes: Options, given: unknown, at: At): unknown {
    if (!isObject(given)) return this.#reject(takes, given, at);
    const owner = at.path || this.#signature.name;
    const entries = Object.entries(given).filter(([key, value]) => {
      if (value === undefined) return false;
      if (Object.hasOwn(takes.options, key)) return true;
      this.#unknown(takes, key, value, at);
      return false;
    });
    const usable = takes.forms ? this.#form(takes.forms, entries, at, owner) : entries;
    if (!usable) return rejected;
    const out: Record<string, unknown> = {};
    for (const [key, value] of usable) {
      const required =
        takes.required.includes(key) || (!!takes.forms?.required && key in takes.forms.keys);
      const otherwise = required ? at.otherwise : "The default is used.";
      const of = takes.options[key] as Value;
      const checked = this.#check(of, value, { path: join(at.path, key), otherwise });
      if (checked === rejected && required) return rejected;
      if (checked !== rejected) out[key] = checked;
    }
    this.#paths.set(out, at.path);
    for (const key of takes.required) {
      if (usable.some(([k]) => k === key)) continue;
      const of = takes.options[key] as Value;
      const checked = this.#check(of, undefined, {
        path: join(at.path, key),
        otherwise: at.otherwise,
      });
      if (checked === rejected) return rejected;
      out[key] = checked;
    }
    return out;
  }

  /**
   * The options of the one form that is given, or `undefined` when a form is due and none is.
   * A second form key, and an option of another form, are reported and left out.
   */
  #form(
    forms: Forms,
    entries: Array<[string, unknown]>,
    at: At,
    owner: string,
  ): Array<[string, unknown]> | undefined {
    const keys = Object.keys(forms.keys);
    const given = entries
      .filter(([key, value]) => keys.includes(key) && value !== false)
      .map(([key]) => key);
    const [form, ...extra] = given;
    if (form === undefined && forms.required) {
      this.#problem(
        "INVALID_ARGUMENT",
        at.path || "options",
        undefined,
        () => `${owner} has none of ${joinOr(keys)}, but it takes one of them. ${at.otherwise}`,
      );
      return;
    }
    return entries.filter(([key, value]) => {
      if (extra.includes(key)) {
        this.#problem(
          "INVALID_ARGUMENT",
          join(at.path, key),
          value,
          () =>
            `${join(at.path, key)} is given with ${form}, but ${owner} takes only one of ${joinOr(keys)}. ${ignored}`,
        );
        return false;
      }
      const takers = keys.filter((k) => forms.keys[k]?.includes(key));
      if (takers.length === 0 || (form !== undefined && takers.includes(form))) return true;
      this.#problem(
        "INVALID_ARGUMENT",
        join(at.path, key),
        value,
        () =>
          `${join(at.path, key)} is given ${form ? `with ${form}` : "alone"}, but only ${joinOr(takers)} takes it. ${ignored}`,
      );
      return false;
    });
  }

  /** Report an option the object does not take, with the options it takes, the nearest first. */
  #unknown(takes: Options, key: string, value: unknown, at: At) {
    const all = Object.keys(takes.options);
    const limit = Math.max(2, Math.floor(key.length / 3));
    const near = all
      .map((name): [string, number] => [name, editDistance(key.toLowerCase(), name.toLowerCase())])
      .filter(([, edits]) => edits <= limit)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    const order = [...near, ...all.filter((name) => !near.includes(name))];
    const owner = at.path || this.#signature.name;
    const path = join(at.path, key);
    this.#problem(
      "UNKNOWN_OPTION",
      path,
      value,
      () => `${path} is not an option. ${owner} takes ${order.join(", ")}. ${ignored}`,
    );
  }

  #reject(takes: Value, given: unknown, at: At): unknown {
    const path = at.path || "options";
    const then = takes.standIn?.says ?? at.otherwise;
    this.#problem("INVALID_ARGUMENT", path, given, () =>
      (given === undefined
        ? `${path} is missing; it takes ${takes.noun}. ${then}`
        : `${path} is ${quote(given)}, but it takes ${takes.noun}. ${then}`
      ).trim(),
    );
    return takes.standIn ? takes.standIn.value : rejected;
  }
}

/** The path of an option inside an object's path; the call's own options have none. */
function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}
