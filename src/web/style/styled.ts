import * as stylex from "@stylexjs/stylex";

/** Keep semantic class names as test and debugging hooks, separate from visual styles. */
export function styled(
  className: string,
  ...values: Array<stylex.StyleXStyles | false | null | undefined>
) {
  const props = stylex.props(...values);
  return {
    ...(props.style ? { style: props.style } : {}),
    className: `${className} ${props.className ?? ""}`.trim(),
  };
}
