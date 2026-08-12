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
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Keep the bundle inside the web application. This is the only location that
 * Vercel can reliably retain when it executes this workspace's build command.
 * The repository-level Vercel config explicitly points to `apps/web/dist`.
 */
const outDir = path.join(appRoot, "dist");

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

// `root` and `outDir` are explicit so the build does not depend on the
// working directory Vercel or npm chose for the workspace command.
await build({ root: appRoot, build: { outDir, emptyOutDir: true } });
console.log("\nBundle written to apps/web/dist/");
