import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/session.ts";

// Optimistisk tjek: uden cookie sendes man til login. Den rigtige kontrol
// (signatur, udløb, virksomhed) sker server-side i requireSession()/authed().
export function proxy(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|offline|_next/static|_next/image|icons|sw.js|manifest.webmanifest|favicon.ico|robots.txt).*)"],
};
