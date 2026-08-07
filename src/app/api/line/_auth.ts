import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GAS 轉接層呼叫平台時帶的共用密鑰。這幾支端點沒有共用帳號的 session cookie
// （GAS 不是瀏覽器），所以改用 header 驗證，並在 src/proxy.ts 放行 /api/line。
export function assertRelaySecret(request: NextRequest): NextResponse | null {
  const expected = process.env.LINE_RELAY_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "伺服器尚未設定 LINE_RELAY_SECRET，請先在環境變數設定後再串接 GAS" },
      { status: 503 }
    );
  }
  const got = request.headers.get("x-line-relay-secret");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
