import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const notices = [
  ["shadcn/ui", readFileSync(resolve(root, "SHADCN-LICENSE"), "utf8")],
];
for (const name of Object.keys(pkg.dependencies)) {
  const directory = resolve(root, "node_modules", name);
  const license = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENCE",
    "LICENSE-MIT",
  ].find((file) => existsSync(resolve(directory, file)));
  if (license)
    notices.push([name, readFileSync(resolve(directory, license), "utf8")]);
}
writeFileSync(
  resolve(root, "dist/THIRD-PARTY-LICENSES.txt"),
  notices.map(([name, text]) => `${name}\n${text}`).join("\n\n"),
);
