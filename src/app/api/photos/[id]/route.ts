import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// wound-photos 是私有 bucket，只能用短效期簽章網址存取。
// 先前的做法是在個案頁面伺服器渲染當下產生 1 小時效期的網址直接塞進 <img src>，
// 頁面停留超過 1 小時後圖片就會失效（決策 2026-07-27 待辦）。
// 改為由這支路由代為轉址：<img src> 指向 /api/photos/<id>，每次瀏覽器實際載入圖片時
// 才即時簽一張短效期網址並 302 轉址過去，網址本身永不過期。
// 存取控制沿用 src/proxy.ts 的共用帳號 session cookie（<img> 同源請求會帶上 cookie）。
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = request.nextUrl.searchParams.get("variant");
  const supabase = supabaseServer();

  const { data: photo } = await supabase
    .from("photos")
    .select("file_path, thumbnail_path")
    .eq("id", id)
    .maybeSingle();

  if (!photo) return new NextResponse("Not found", { status: 404 });

  // 舊照片沒有縮圖時 fallback 用原圖（與個案頁面既有行為一致）
  const path = variant === "thumb" ? photo.thumbnail_path ?? photo.file_path : photo.file_path;

  const { data: signed, error } = await supabase.storage.from("wound-photos").createSignedUrl(path, 300);
  if (error || !signed?.signedUrl) return new NextResponse("Signed URL failed", { status: 502 });

  // 轉址本身不能被快取，否則簽章過期後瀏覽器會重用舊網址而載入失敗
  return NextResponse.redirect(signed.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
