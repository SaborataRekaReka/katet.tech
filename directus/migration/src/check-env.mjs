import process from "node:process";
import { listMissingEnv, loadMigrationEnv } from "./env.mjs";

loadMigrationEnv();

const needsMedia = process.argv.includes("--media");

const baseRequired = [
  "WP_DB_CONTAINER",
  "WP_DB_NAME",
  "WP_DB_USER",
  "WP_DB_PASSWORD",
  "DATABASE_URL",
];

const mediaRequired = [
  "DIRECTUS_URL",
  "DIRECTUS_ADMIN_EMAIL",
  "DIRECTUS_ADMIN_PASSWORD",
  "WP_UPLOADS_DIR",
];

const required = needsMedia ? [...baseRequired, ...mediaRequired] : baseRequired;
const missing = listMissingEnv(required);

if (missing.length > 0) {
  console.error("Missing required migration environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error("Copy directus/migration/.env.example to directus/migration/.env and fill the values.");
  process.exit(1);
}

console.log(`Migration environment check passed${needsMedia ? " (media mode)" : ""}.`);
