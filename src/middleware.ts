import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isCsrfExempt(pathname: string) {
  return (
    pathname === "/api/admin/auth/login" ||
    pathname === "/api/admin/login"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin") return NextResponse.next();
  if (pathname === "/admin/change-password") return NextResponse.next();

  if (
    pathname.startsWith("/api/admin/auth/login") ||
    pathname.startsWith("/api/admin/login")
  ) {
    return NextResponse.next();
  }

  const method = req.method.toUpperCase();
  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  if (pathname.startsWith("/api/admin") && isMutating && !isCsrfExempt(pathname)) {
    const cookieToken = req.cookies.get("admin_csrf")?.value ?? "";
    const headerToken = req.headers.get("x-csrf-token") ?? "";

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return NextResponse.json({ ok: false, error: "BAD_CSRF_TOKEN" }, { status: 403 });
    }
  }

  if (pathname.startsWith("/admin")) {
    const hasSession = !!req.cookies.get("admin_session")?.value;
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};