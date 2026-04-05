import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();
const outDir = resolve(repoRoot, ".artifacts", "packs");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of readdirSync(join(repoRoot, "packages"))) {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "packages", entry, "package.json"), "utf8"),
  );
  execFileSync("pnpm", ["--filter", packageJson.name, "pack", "--pack-destination", outDir], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
