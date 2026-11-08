import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { iconName } from "./document.ts";

/** Compile literal MDX icon names into ordinary, tree-shaken SVG imports. */
export function iconImports() {
  return (tree: Root) => {
    let index = 0;
    const imports: Root["children"] = [];
    visit(tree, (node) => {
      if (
        (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") ||
        node.name !== "Icon"
      )
        return;
      const name = node.attributes.find(
        (attr) => attr.type === "mdxJsxAttribute" && attr.name === "name",
      );
      if (name?.type !== "mdxJsxAttribute") return;
      if (typeof name.value !== "string" || !iconName.test(name.value)) {
        throw new Error(
          "Icon name must be a literal collection:icon, for example lucide:database. For dynamic icons, import the component and pass icon={Component}.",
        );
      }
      const identifier = `_yapparatusIcon${index++}`;
      const source = `~icons/${name.value.replace(":", "/")}`;
      imports.push({
        type: "mdxjsEsm",
        value: `import ${identifier} from ${JSON.stringify(source)};`,
        data: {
          estree: {
            type: "Program",
            sourceType: "module",
            body: [
              {
                type: "ImportDeclaration",
                attributes: [],
                source: { type: "Literal", value: source },
                specifiers: [
                  {
                    type: "ImportDefaultSpecifier",
                    local: { type: "Identifier", name: identifier },
                  },
                ],
              },
            ],
          },
        },
      });
      node.attributes.push({
        type: "mdxJsxAttribute",
        name: "icon",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: identifier,
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: { type: "Identifier", name: identifier },
                },
              ],
            },
          },
        },
      });
    });
    tree.children.unshift(...imports);
  };
}
