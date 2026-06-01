import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const frontendRoot = path.resolve(process.cwd());

const envFiles = [
  path.join(frontendRoot, ".env.local"),
  path.join(frontendRoot, ".env"),
];

for (const filePath of envFiles) {
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

const requiredVars = ["DATABASE_URL", "NEXT_PUBLIC_DIRECTUS_URL", "NEXT_PUBLIC_SITE_URL"];
const missing = requiredVars.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error("Missing required frontend environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error("Copy frontend/.env.example to frontend/.env.local and fill the values.");
  process.exit(1);
}

console.log("Frontend environment check passed.");
