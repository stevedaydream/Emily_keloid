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
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append("case_id", caseId);
      formData.append("item_id", itemId);
      formData.append("zone_key", zoneKey);
      formData.append("file", blob, "photo.jpg");
      const result = await uploadPhotoAction(formData);
      setMessage(result.message);
      setStatus(result.ok ? "done" : "error");
    }, "image/jpeg");
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <button type="button" onClick={onBack} className="text-xs text-slate-400 underline">
            ← 重新選部位
          </button>
          <p className="text-sm font-medium text-slate-700">
            {zoneDisplayName}（{DOSE_CATEGORY_LABEL[doseCategory]}）
          </p>
        </div>

        <div className="relative bg-black">
          {status === "done" ? (
            <div className="p-8 text-center text-white">
              <p className="text-lg">✓ {message}</p>
              <button onClick={onDone} className="mt-3 inline-block text-sm text-blue-300 underline">
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
                <button onClick={retake} className="flex-1 rounded-md border border-slate-300 py-2 text-sm">
                  重拍
                </button>
                <button
                  onClick={confirmUpload}
                  disabled={status === "uploading"}
                  className="flex-1 rounded-md bg-slate-900 py-2 text-sm font-medium text-white"
                >
                  {status === "uploading" ? "上傳中..." : "確認上傳"}
                </button>
              </>
            ) : (
              <button onClick={capture} className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white">
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
