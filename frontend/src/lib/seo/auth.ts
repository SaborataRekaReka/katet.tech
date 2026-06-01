import "server-only";

import { cookies } from "next/headers";

/**
 * Minimal admin auth for the SEO panel.
 * - Set SEO_ADMIN_TOKEN in the environment to enable protection.
 * - If it is not set, access is allowed only in development (NODE_ENV !== production)
 *   so local work is frictionless but production stays locked by default.
 */

const COOKIE_NAME = "seo_admin";

export function getAdminToken(): string {
  return process.env.SEO_ADMIN_TOKEN?.trim() || "";
}

export async function isAdmin(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return process.env.NODE_ENV !== "production";
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === token;
}

export function authCookieName(): string {
  return COOKIE_NAME;
}

/** Validates a request token (header or body) for API routes. */
export async function assertApiAdmin(headerToken: string | null): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return process.env.NODE_ENV !== "production";
  if (headerToken && headerToken === token) return true;
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === token;
}
