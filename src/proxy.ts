import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/favicon.ico"];
const NO_OPERATOR_REQUIRED = ["/login", "/operator", "/favicon.ico"];

// RSC 拿不到目前路徑，但 root layout 需要它來決定要不要渲染 header
// （病人自填頁是全螢幕、無導覽的介面）。把路徑放進 request header 往下傳。
function passThrough(request: NextRequest, pathname: string) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    // GAS 轉接層呼叫的端點：它不是瀏覽器、沒有共用帳號的 session cookie，
    // 改用 x-line-relay-secret header 驗證（見 src/app/api/line/_auth.ts）。
    pathname.startsWith("/api/line")
  ) {
    return passThrough(request, pathname);
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

  return passThrough(request, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
