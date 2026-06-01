import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const localDefaults = {
  WP_DB_CONTAINER: "katet-wp-db",
  WP_DB_NAME: "katet_local",
  WP_DB_USER: "katet_local",
  WP_DB_PASSWORD: "katet_local_password",
  WP_UPLOADS_DIR: path.resolve(process.cwd(), "..", "..", "source", "wp-local", "wp-content", "uploads"),
  DATABASE_URL: "postgres://katet_directus:katet_directus_password@127.0.0.1:55432/katet_directus",
  DIRECTUS_URL: "http://localhost:8055",
  DIRECTUS_PUBLIC_URL: "http://localhost:8055",
  DIRECTUS_ADMIN_EMAIL: "admin@example.com",
  DIRECTUS_ADMIN_PASSWORD: "katet_directus_admin",
};

let loaded = false;

export function loadMigrationEnv() {
  if (loaded) return;
  dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
  dotenv.config();
  loaded = true;
}

export function envValue(name, fallback = undefined) {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }

  const defaultValue = localDefaults[name];
  return typeof defaultValue === "string" ? defaultValue : undefined;
}

export function envRequired(name) {
  const value = envValue(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getWpConfig() {
  return {
    container: envValue("WP_DB_CONTAINER"),
    database: envValue("WP_DB_NAME"),
    user: envValue("WP_DB_USER"),
    password: envValue("WP_DB_PASSWORD"),
  };
}

export function getDatabaseUrl() {
  return envRequired("DATABASE_URL");
}

export function getDirectusConfig() {
  return {
    url: envValue("DIRECTUS_URL") || envValue("DIRECTUS_PUBLIC_URL"),
    email: envValue("DIRECTUS_ADMIN_EMAIL"),
    password: envValue("DIRECTUS_ADMIN_PASSWORD"),
  };
}

export function getUploadsDir() {
  const configured = envValue("WP_UPLOADS_DIR");
  if (!configured) {
    return path.resolve(process.cwd(), "..", "..", "source", "wp-local", "wp-content", "uploads");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

export function listMissingEnv(names) {
  return names.filter((name) => !envValue(name));
}
