import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  resolveMiddlewareDatabaseId,
  TENANT_DB_HEADER,
} from "@/lib/tenant/config";

export function middleware(request: NextRequest) {
  const databaseId = resolveMiddlewareDatabaseId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_DB_HEADER, databaseId);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
