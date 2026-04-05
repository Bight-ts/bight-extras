import { execFileSync } from "node:child_process";

try {
  const version = execFileSync(
    "npm",
    ["view", "@bight-ts/core", "version", "--json"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    },
  ).trim();

  if (!version) {
    console.error("Unable to verify @bight-ts/core on npm.");
    process.exit(1);
  }

  console.log(`Found published @bight-ts/core version ${version}.`);
} catch (error) {
  const stderr = String(error.stderr ?? "");

  if (stderr.includes("E404")) {
    console.error(
      "Refusing to publish extras because @bight-ts/core is not available on npm yet. Publish core first.",
    );
    process.exit(1);
  }

  console.error(stderr || String(error));
  process.exit(1);
}
