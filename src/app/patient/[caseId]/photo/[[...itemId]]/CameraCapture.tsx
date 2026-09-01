"use client";

import { useEffect, useRef, useState } from "react";
import { maskShapeForCategory, DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import PhotoAligner, { type AlignMaskShape } from "./PhotoAligner";
import { uploadPhotoAction } from "./actions";

/** 相機的即時蒙板樣式 → 對齊編輯器的蒙板樣式（同一個部位分類，兩邊看到的框要一致） */
function alignShapeFor(maskShape: string): AlignMaskShape {
  if (maskShape === "ear_outline") return "ellipse";
  if (maskShape === "chest_outline") return "rect_landscape";
  return "rect_square";
}

/** 時間戳 → 本地的 `YYYY-MM-DD`（`<input type="date">` 要的格式）。不能用 toISOString，那是 UTC。 */
function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CameraCapture({
  caseId,
  itemId,
  zoneKey,
  zoneDisplayName,
  doseCategory,
  lesionId,
  initialSize,
  sizeLocked = false,
  doneLabel = "回個案頁面",
  onBack,
  onDone,
}: {
  caseId: string;
  itemId: string;
  zoneKey: string;
  zoneDisplayName: string;
  doseCategory: string;
  lesionId?: string | null;
  /** 這個部位已經量過的長寬高，帶進來讓人員只補缺的那一格 */
  initialSize?: { length: string; width: string; height: string };
  /** 已登記手術：病灶已切除，不再收長寬高，避免把術前 baseline 蓋掉（助理 2026-08-24） */
  sizeLocked?: boolean;
  doneLabel?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const maskShape = maskShapeForCategory(doseCategory);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  // 2026-08-26：候補上傳。助理要的是「不一定要當下馬上拍」——病人先走了、
  // 照片還在公務機相簿裡，事後補得上去。
  //   source   camera＝經過上面那層對齊框／比例尺蒙板拍的；upload＝相簿選的（沒有蒙板）。
  //   takenAt  真正的拍攝日，預帶檔案的 lastModified；人員改得了（相簿轉存會把時間戳弄丟）。
  // 兩者都跟著照片一起送，這樣之後做影像對比才分得出哪些是診間標準拍攝。
  const [source, setSource] = useState<"camera" | "upload">("camera");
  // 2026-09-02：對齊編輯器。相簿選完自動進入（那條路徑本來完全沒有對齊機制），
  // 相機拍的則是按「調整」才進——現場已經有即時對齊框，不該再多卡一步門診動線。
  const [editing, setEditing] = useState(false);
  const [takenAt, setTakenAt] = useState("");
  // 拍攝日期的上界（不能選未來）。在 pickFile 裡算——那是事件處理器，
  // 在 render 當中呼叫 Date.now() 會被 react-hooks/purity 擋下。
  // 這個欄位只在選完檔案後才出現，所以那時才有值就夠了。
  const [todayLocal, setTodayLocal] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // 長寬高跟照片一起送（決策 2026-08-20）。分兩趟做的話，門診一被打斷就只剩照片沒有尺寸，
  // 而尺寸是病人一走就再也補不回來的那一半（照片裡的尺沒有被程式讀出來過，見決策 #3）。
  const [size, setSize] = useState(initialSize ?? { length: "", width: "", height: "" });

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCameraError("無法取得相機權限，請確認瀏覽器已允許存取相機（需 HTTPS）"));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);
    setSource("camera");
    setTakenAt("");
    setCapturedUrl(canvas.toDataURL("image/jpeg"));
  }

  /**
   * 從相簿選一張。**畫進同一張 canvas**，所以底下的 confirmUpload（含縮圖那段）
   * 完全不用改，兩條路徑送出的東西格式一致。
   *
   * 長邊壓到 2400px：手機相簿的原始檔動輒 12MP，畫成 canvas 再 toDataURL 會在
   * 平板上吃掉大量記憶體；2400px 對傷口照片綽綽有餘。
   */
  function pickFile(file: File) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTodayLocal(localDate(Date.now()));
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      setSource("upload");
      setTakenAt(localDate(file.lastModified));
      setCapturedUrl(canvas.toDataURL("image/jpeg"));
      // 相簿的照片構圖是散的，直接進對齊編輯器（可取消，取消就用原圖）
      setEditing(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("error");
      setMessage("這個檔案讀不出來，請換一張圖片");
    };
    img.src = url;
  }

  function retake() {
    setCapturedUrl(null);
    setSource("camera");
    setEditing(false);
    setTakenAt("");
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * 對齊完成：把編輯器輸出的畫布寫回上傳用的那張 canvas。
   * confirmUpload 讀的就是它，所以縮圖／尺寸／拍攝日那一整套邏輯一行都不用動。
   */
  function applyAligned(out: HTMLCanvasElement) {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = out.width;
      canvas.height = out.height;
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx?.drawImage(out, 0, 0);
      setCapturedUrl(canvas.toDataURL("image/jpeg", 0.9));
    }
    setEditing(false);
  }

  async function confirmUpload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("uploading");

    const toBlob = (c: HTMLCanvasElement, quality?: number) =>
      new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", quality));

    const blob = await toBlob(canvas);
    if (!blob) {
      setStatus("error");
      setMessage("拍照失敗，請重試");
      return;
    }

    // 縮圖：individual grid 顯示用小尺寸版本，降低瀏覽流量，只有點開大圖才載入原始解析度。
    const maxDim = 400;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = Math.round(canvas.width * scale);
    thumbCanvas.height = Math.round(canvas.height * scale);
    thumbCanvas.getContext("2d")?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbBlob = await toBlob(thumbCanvas, 0.8);

    const formData = new FormData();
    formData.append("case_id", caseId);
    formData.append("item_id", itemId);
    formData.append("zone_key", zoneKey);
    if (lesionId) formData.append("lesion_id", lesionId);
    // 已手術就一個尺寸欄位都不送：帶進來的 initialSize 原封不動送回去也會把 measured_at
    // 蓋成今天，讓術前的 baseline 看起來像術後才量的。
    if (!sizeLocked) {
      formData.append("length_cm", size.length);
      formData.append("width_cm", size.width);
      formData.append("height_cm", size.height);
    }
    formData.append("file", blob, "photo.jpg");
    if (thumbBlob) formData.append("thumb", thumbBlob, "thumb.jpg");
    formData.append("source", source);
    // 現場拍的不送日期，讓伺服器用 now()；候補上傳的才送真正的拍攝日
    if (source === "upload" && takenAt) formData.append("taken_at", takenAt);
    const result = await uploadPhotoAction(formData);
    setMessage(result.message);
    setStatus(result.ok ? "done" : "error");
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <button type="button" onClick={onBack} className="shrink-0 whitespace-nowrap text-xs text-slate-400 underline">
            ← 重新選部位
          </button>
          <p className="truncate text-sm font-medium text-slate-700">
            {zoneDisplayName}（{DOSE_CATEGORY_LABEL[doseCategory]}）
          </p>
        </div>

        {editing && capturedUrl ? (
          <PhotoAligner
            srcUrl={capturedUrl}
            initialShape={alignShapeFor(maskShape)}
            onCancel={() => setEditing(false)}
            onApply={applyAligned}
          />
        ) : (
          <>
        <div className="relative bg-black">
          {status === "done" ? (
            <div className="p-8 text-center text-white">
              <p className="text-lg">✓ {message}</p>
              <button onClick={onDone} className="mt-3 inline-block whitespace-nowrap text-sm text-blue-300 underline">
                {doneLabel}
              </button>
            </div>
          ) : capturedUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedUrl} alt="拍攝預覽" className="w-full" />
              {/* 2026-09-02：原文是「候補上傳（未經對齊框）」，但相簿路徑現在會先過對齊編輯器，
                  那句話已經不成立；而且它只是在標記「這張是哪條路徑來的」，不是在判定照片不合格。 */}
              {source === "upload" && (
                <div className="absolute left-2 top-2 rounded bg-slate-700/80 px-2 py-1 text-xs text-white">
                  相簿補傳
                </div>
              )}
            </>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`border-2 border-dashed border-white/80 ${
                    maskShape === "ear_outline"
                      ? "h-40 w-28 rounded-full"
                      : maskShape === "chest_outline"
                      ? "h-32 w-48 rounded-2xl"
                      : "h-48 w-48 rounded-md"
                  }`}
                />
                <div className="absolute left-1/2 top-1/2 h-full w-px -translate-x-1/2 bg-white/40" />
                <div className="absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2 bg-white/40" />
              </div>
              <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
                請將紙質直尺放入畫面下緣後再拍攝
              </div>
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
                  {cameraError}
                </div>
              )}
            </>
          )}
        </div>

        {/* 候補上傳的照片不是今天拍的，拍攝日要跟著照片一起記下來——匯出的照片 zip
            是用拍攝日命名的，記成上傳日會讓整條時間序錯位。
            （「本次回診拍過了沒」看的是上傳時間，所以回填拍攝日不會害那一步收不掉。） */}
        {status !== "done" && source === "upload" && (
          <div className="border-t border-slate-200 px-3 pt-3">
            <label className="block">
              <span className="block text-xs text-slate-500">這張是哪一天拍的？</span>
              <input
                type="date"
                value={takenAt}
                max={todayLocal || undefined}
                onChange={(e) => setTakenAt(e.target.value)}
                className="mt-0.5 min-h-12 w-full rounded-md border border-slate-300 px-2 text-base tabular-nums"
              />
            </label>
            {/* 紙尺提醒（助理 2026-08-28：上傳維持現狀，加提醒即可）。
                用系統內建的相機拍時，畫面上就有對齊框與比例尺參照框；從相簿選圖沒有那一層，
                照片裡有沒有那把紙尺，決定這張之後能不能拿來比對大小。
                做成明顯的黃框而不是灰色小字——這是上傳路徑唯一會漏掉的東西。 */}
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              ⚠️ 請確認這張照片裡<b>有放紙質直尺</b>。沒有尺的照片之後無法比對病灶大小。
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              拍攝日期已從檔案時間讀出，不對就改。構圖要再調整可按下方「調整」重開對齊框；系統會記成「相簿補傳」以便日後分辨拍攝條件。
            </p>
          </div>
        )}

        {/* 尺寸就在相機下方：拍完不用再回上一頁找輸入格，量完拍完一次送出。
            這裡用原生數字鍵盤而不是大鍵盤——相機預覽已經吃掉大半個畫面，
            再放一組 3×4 的大鍵盤就要一直捲。 */}
        {status !== "done" && sizeLocked && (
          <div className="border-t border-slate-200 px-3 pt-3">
            <p className="text-xs text-slate-500">
              已手術，術後不再量尺寸。術前 baseline：
              <b className="tabular-nums">
                {initialSize && (initialSize.length || initialSize.width || initialSize.height)
                  ? `${initialSize.length || "—"}×${initialSize.width || "—"}×${initialSize.height || "—"} cm`
                  : "無"}
              </b>
            </p>
          </div>
        )}

        {status !== "done" && !sizeLocked && (
          <div className="border-t border-slate-200 px-3 pt-3">
            <p className="text-xs text-slate-500">病灶尺寸（可留空，之後再補）</p>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {([
                ["length", "長"],
                ["width", "寬"],
                ["height", "高"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="block text-[11px] text-slate-500">{label} cm</span>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={size[key]}
                    onChange={(e) => setSize({ ...size, [key]: e.target.value })}
                    className="mt-0.5 min-h-12 w-full rounded-md border border-slate-300 px-2 text-lg tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {status !== "done" && (
          <div className="flex gap-2 p-3">
            {capturedUrl ? (
              <>
                <button onClick={retake} className="flex-1 whitespace-nowrap rounded-md border border-slate-300 py-2 text-sm">
                  重拍
                </button>
                {/* 2026-09-02：兩條路徑都能再對齊一次（相機路徑不強制，按了才進編輯器） */}
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 whitespace-nowrap rounded-md border border-slate-300 py-2 text-sm text-slate-700"
                >
                  調整
                </button>
                <button
                  onClick={confirmUpload}
                  disabled={status === "uploading"}
                  className="flex-1 whitespace-nowrap rounded-md bg-slate-900 py-2 text-sm font-medium text-white"
                >
                  {status === "uploading" ? "上傳中..." : "確認上傳"}
                </button>
              </>
            ) : (
              <>
                <button onClick={capture} className="flex-1 whitespace-nowrap rounded-md bg-slate-900 py-2 text-sm font-medium text-white">
                  拍照
                </button>
                {/* 候補上傳（2026-08-26）：病人已經走了、照片還在公務機相簿裡時的補救路徑 */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 whitespace-nowrap rounded-md border border-slate-300 py-2 text-sm text-slate-700"
                >
                  從相簿選圖
                </button>
              </>
            )}
          </div>
        )}
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
          }}
        />
        {status === "error" && <p className="px-3 pb-2 text-xs text-red-500">{message}</p>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
