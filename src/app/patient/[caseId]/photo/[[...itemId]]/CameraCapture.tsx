"use client";

import { useEffect, useRef, useState } from "react";
import { maskShapeForCategory, DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { uploadPhotoAction } from "./actions";

export default function CameraCapture({
  caseId,
  itemId,
  zoneKey,
  zoneDisplayName,
  doseCategory,
  onBack,
  onDone,
}: {
  caseId: string;
  itemId: string;
  zoneKey: string;
  zoneDisplayName: string;
  doseCategory: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const maskShape = maskShapeForCategory(doseCategory);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

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
    setCapturedUrl(canvas.toDataURL("image/jpeg"));
  }

  function retake() {
    setCapturedUrl(null);
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
    formData.append("file", blob, "photo.jpg");
    if (thumbBlob) formData.append("thumb", thumbBlob, "thumb.jpg");
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

        <div className="relative bg-black">
          {status === "done" ? (
            <div className="p-8 text-center text-white">
              <p className="text-lg">✓ {message}</p>
              <button onClick={onDone} className="mt-3 inline-block whitespace-nowrap text-sm text-blue-300 underline">
                回個案頁面
              </button>
            </div>
          ) : capturedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedUrl} alt="拍攝預覽" className="w-full" />
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

        {status !== "done" && (
          <div className="flex gap-2 p-3">
            {capturedUrl ? (
              <>
                <button onClick={retake} className="flex-1 whitespace-nowrap rounded-md border border-slate-300 py-2 text-sm">
                  重拍
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
              <button onClick={capture} className="w-full whitespace-nowrap rounded-md bg-slate-900 py-2 text-sm font-medium text-white">
                拍照
              </button>
            )}
          </div>
        )}
        {status === "error" && <p className="px-3 pb-2 text-xs text-red-500">{message}</p>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
