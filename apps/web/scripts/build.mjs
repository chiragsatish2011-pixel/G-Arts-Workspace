/**
 * Builds the Workspace front end.
 *
 * This calls Vite's own API rather than running the `vite` executable. In a
 * workspace repository the executable is a symlink that npm creates in
 * `node_modules/.bin`, and whether it lands where the shell can find it
 * depends on how the install hoisted things. On Vercel it did not: the build
 * stopped with `sh: vite: command not found` even though the package was
 * listed as a dependency.
 *
 * `import("vite")` uses Node's own module resolution, which walks up from
 * this file through every `node_modules` above it. That finds the package
 * wherever the install decided to put it, with no shell and no PATH involved.
 */
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..", "..");

/**
 * The bundle is written to `dist/` at the repository root rather than inside
 * the app. Vercel looks for an output directory by name, and a project
 * created from its own detection defaults to "dist" — which took precedence
 * over `outputDirectory` in vercel.json and failed the deploy after a
 * successful build. Building where it already looks means the two cannot
 * disagree again.
 */
const outDir = path.join(repoRoot, "dist");

let build;
try {
  ({ build } = await import("vite"));
} catch (cause) {
  console.error(
    "Could not load Vite.\n" +
      "It is a dependency of @g-arts/web, so this means the install did not complete.\n" +
      "Run `npm ci` from the repository root and try again.\n",
  );
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}

// `root` is passed explicitly so the build does not depend on the working
// directory the caller happened to use.
await build({ root: appRoot, build: { outDir, emptyOutDir: true } });

/**
 * The same bundle is also placed inside the app.
 *
 * Vercel looks for a directory called `dist` relative to whatever Root
 * Directory the project is configured with, and that setting is not in this
 * repository — it lives in the dashboard. A project set to the repository root
 * looks in `./dist`; one set to `apps/web` looks in `apps/web/dist`. Writing
 * both means the deploy succeeds either way instead of failing with "No Output
 * Directory named dist found" after a build that actually worked.
 */
const appDist = path.join(appRoot, "dist");
await rm(appDist, { recursive: true, force: true });
await cp(outDir, appDist, { recursive: true });
console.log(`\nBundle written to ${path.relative(repoRoot, outDir)}/ and ${path.relative(repoRoot, appDist)}/`);
