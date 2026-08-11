/**
 * Makes a fresh clone usable straight after `npm install`.
 *
 * Two things in this repository are generated rather than committed, and
 * without them a clone typechecks with dozens of confusing errors:
 *
 *   - `@g-arts/chat-shared` is a workspace package that both chat apps import
 *     by name. Until it is built there is no `dist`, so the import cannot
 *     resolve and every file using it reports "Cannot find module".
 *   - The Prisma clients supply `Role`, `Team` and every model type. Until
 *     `prisma generate` has run those exports simply do not exist.
 *
 * This never fails the install. A deploy that only builds the web app does
 * not need either of these, and breaking `npm ci` on a hosting provider to
 * prepare something it will not use would be a poor trade. Anything that
 * cannot be prepared is reported and skipped.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

/** Skip inside CI that only builds the front end, and inside nested installs. */
if (process.env.G_ARTS_SKIP_POSTINSTALL === "1") {
  console.log("postinstall: skipped (G_ARTS_SKIP_POSTINSTALL=1)");
  process.exit(0);
}

function run(label, command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: "pipe", env: { ...process.env, G_ARTS_SKIP_POSTINSTALL: "1" } });
    console.log(`postinstall: ${label} — ready`);
    return true;
  } catch (error) {
    // Reported, never fatal. The message matters more than the stack.
    const detail = String(error?.stderr ?? error?.message ?? error).trim().split("\n").slice(-2).join(" ");
    console.log(`postinstall: ${label} — skipped (${detail.slice(0, 160)})`);
    return false;
  }
}

// The shared package first: the Prisma steps do not depend on it, but the
// chat apps do, and building it is the cheaper of the two.
if (existsSync(path.join(root, "packages/chat-shared/package.json"))) {
  run("@g-arts/chat-shared", npm, ["run", "build", "--workspace=@g-arts/chat-shared"], root);
}

for (const [label, dir] of [
  ["workspace Prisma client", "apps/api"],
  ["chat Prisma client", "packages/chat-db"],
]) {
  const cwd = path.join(root, dir);
  // packages/chat-db keeps its schema under prisma/, same as apps/api.
  if (existsSync(path.join(cwd, "prisma/schema.prisma"))) {
    run(label, npx, ["prisma", "generate"], cwd);
  }
}
