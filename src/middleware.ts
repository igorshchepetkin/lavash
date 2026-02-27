import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow login page itself + login API
  if (pathname === "/admin") return NextResponse.next();
  if (pathname.startsWith("/api/admin/login")) return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    const isAdmin = req.cookies.get("admin")?.value === "1";
    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};