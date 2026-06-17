/** @internal — not part of @hirobius/design-system public API surface. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

function loadEnvLocal() {
  if (!existsSync(envPath)) {
    return;
  }

  const envFile = readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = rawValue
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n");
  }
}

async function main() {
  loadEnvLocal();

  const figmaPat = process.env.FIGMA_PAT;
  const figmaFileId = process.env.FIGMA_FILE_ID;

  if (!figmaPat || !figmaFileId) {
    throw new Error("Missing FIGMA_PAT or FIGMA_FILE_ID in .env.local.");
  }

  const response = await fetch(`https://api.figma.com/v1/files/${figmaFileId}`, {
    headers: {
      "X-Figma-Token": figmaPat,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : `Figma API returned ${response.status} ${response.statusText}`;

    throw new Error(message);
  }

  if (!data?.name) {
    throw new Error("Figma API response did not include a file name.");
  }

  console.log("✅ Successfully connected to Figma file:", data.name);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("❌ Failed to connect to Figma:", message);
  process.exitCode = 1;
});
