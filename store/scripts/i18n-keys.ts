/**
 * Lists the English phrases the shop translates: every string passed to t()
 * or translate() in the source (both sides of `cond ? "A" : "B"` too).
 *
 *   npx tsx scripts/i18n-keys.ts            # phrases with no Hindi yet
 *   npx tsx scripts/i18n-keys.ts --all      # every phrase
 *
 * The same check runs as a unit test (src/i18n/hi.test.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { HI } from "../src/i18n/hi";

const ROOTS = ["src/app/[lang]", "src/components/shop", "src/components/ui", "src/components/form.tsx", "src/components/copy-button.tsx", "src/i18n"];

function files(entry: string): string[] {
  const stat = statSync(entry);
  if (stat.isFile()) return /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") ? [entry] : [];
  return readdirSync(entry).flatMap((name) => files(path.join(entry, name)));
}

/** String literals an expression can evaluate to (through ternaries, || and parentheses). */
function literals(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literals(node.expression);
  if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
  if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) return [...literals(node.left), ...literals(node.right)];
  return [];
}

export function sourceKeys(root = process.cwd()): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of ROOTS.flatMap((r) => files(path.join(root, r)))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      const add = (text: string) => {
        if (text && !keys.has(text)) keys.set(text, `${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      };
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        const arg = name === "t" || name === "tr" ? node.arguments[0] : name === "translate" ? node.arguments[1] : undefined;
        if (arg) literals(arg).forEach(add);
        // localizedMetadata({ title: "…", description: "…" }) translates its title and description.
        const meta = name === "localizedMetadata" ? node.arguments[0] : undefined;
        if (meta && ts.isObjectLiteralExpression(meta))
          for (const prop of meta.properties)
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ["title", "description"].includes(prop.name.text)) literals(prop.initializer).forEach(add);
      }
      // <ContentPage title="…"> translates its title (unless the page is English-only).
      if (ts.isJsxAttribute(node) && node.name.getText() === "title" && node.initializer && ts.isStringLiteral(node.initializer)) {
        const tag = node.parent.parent;
        if ((ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)) && tag.tagName.getText() === "ContentPage") add(node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
}

if (process.argv[1]?.endsWith("i18n-keys.ts")) {
  const all = process.argv.includes("--all");
  const keys = sourceKeys();
  let missing = 0;
  for (const [text, where] of [...keys].sort((a, b) => a[1].localeCompare(b[1]))) {
    if (all || !(text in HI)) {
      missing++;
      console.log(`${where}\t${text}`);
    }
  }
  console.error(`${keys.size} phrases, ${all ? missing : missing + " without Hindi"}`);
}
