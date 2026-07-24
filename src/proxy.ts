import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/favicon.ico"];
const NO_OPERATOR_REQUIRED = ["/login", "/operator", "/favicon.ico"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("keloid_session")?.value;
  if (session !== "ok") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!NO_OPERATOR_REQUIRED.some((p) => pathname.startsWith(p))) {
    const operator = request.cookies.get("keloid_operator")?.value;
    if (!operator) {
      const operatorUrl = new URL("/operator", request.url);
      operatorUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(operatorUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
