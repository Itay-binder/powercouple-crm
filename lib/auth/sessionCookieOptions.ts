import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import type { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { TENANT_COOKIE } from "@/lib/tenant/config";

/**
 * iframe cross-site: לפעמים נדרש Set-Cookie עם Partitioned (CHIPS).
 * פעיל רק אם מגדירים SESSION_COOKIE_CROSS_SITE=true.
 */
export function crossSiteSessionCookiesEnabled(): boolean {
  return process.env.SESSION_COOKIE_CROSS_SITE === "true";
}

function buildPartitionedSetCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function buildPartitionedDeleteCookieHeader(name: string): string {
  return [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    "Max-Age=0",
  ].join("; ");
}

function buildTenantSetCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function buildTenantDeleteCookieHeader(name: string): string {
  return [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    "Max-Age=0",
  ].join("; ");
}

export function setSessionCookieOnResponse(
  res: NextResponse,
  sessionToken: string,
  maxAgeSeconds: number
): void {
  if (!crossSiteSessionCookiesEnabled()) {
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });
    return;
  }

  res.headers.append(
    "Set-Cookie",
    buildPartitionedSetCookieHeader(SESSION_COOKIE, sessionToken, maxAgeSeconds)
  );
}

export function clearSessionCookieOnResponse(res: NextResponse): void {
  if (!crossSiteSessionCookiesEnabled()) {
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    res.cookies.set(TENANT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return;
  }

  res.headers.append(
    "Set-Cookie",
    buildPartitionedDeleteCookieHeader(SESSION_COOKIE)
  );
  res.headers.append("Set-Cookie", buildTenantDeleteCookieHeader(TENANT_COOKIE));
}

export function setTenantCookieOnResponse(
  res: NextResponse,
  tenantSlug: string,
  maxAgeSeconds: number
): void {
  if (!crossSiteSessionCookiesEnabled()) {
    res.cookies.set(TENANT_COOKIE, tenantSlug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });
    return;
  }

  res.headers.append(
    "Set-Cookie",
    buildTenantSetCookieHeader(TENANT_COOKIE, tenantSlug, maxAgeSeconds)
  );
}

// Kept for compatibility if we later copy more affiliate code.
export function getSessionCookieDeleteOptions(): Partial<ResponseCookie> {
  return { httpOnly: true, path: "/", maxAge: 0 };
}

