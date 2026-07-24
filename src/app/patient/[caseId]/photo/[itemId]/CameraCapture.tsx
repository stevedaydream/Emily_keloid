"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { uploadPhotoAction } from "./actions";

export default function CameraCapture({
  caseId,
  itemId,
  bodySite,
  maskType,
  maskShape,
}: {
  caseId: string;
  itemId: string;
  bodySite: string | null;
  maskType: string;
  maskShape: string;
}) {
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
      .catch(() => setCameraError("無法取得相機權限，請確認瀏覽器權限設定（demo 模擬頁面需要 HTTPS 與相機存取權限）"));
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
      formData.append("body_site", bodySite ?? "");
      formData.append("mask_type", maskType);
      formData.append("file", blob, "photo.jpg");
      const result = await uploadPhotoAction(formData);
      setMessage(result.message);
      setStatus(result.ok ? "done" : "error");
    }, "image/jpeg");
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-slate-300 shadow-sm">
        <div className="bg-[#06C755] px-4 py-3 text-white">
          <p className="text-sm font-semibold">蟹足腫研究小幫手（模擬拍照頁面）</p>
          <p className="text-xs opacity-80">部位：{bodySite ?? "通用"} ・ 對齊蒙板：{maskShape}</p>
        </div>

        <div className="relative bg-black">
          {status === "done" ? (
            <div className="p-8 text-center text-white">
              <p className="text-lg">✓ {message}</p>
              <Link href={`/cases/${caseId}`} className="mt-3 inline-block text-sm text-blue-300 underline">
                回個案頁面（診間端視角）
              </Link>
            </div>
          ) : capturedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedUrl} alt="拍攝預覽" className="w-full" />
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
              {/* 對齊蒙板：通用十字＋比例尺參照框 */}
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
          <div className="flex gap-2 bg-white p-3">
            {capturedUrl ? (
              <>
                <button onClick={retake} className="flex-1 rounded-md border border-slate-300 py-2 text-sm">
                  重拍
                </button>
                <button
                  onClick={confirmUpload}
                  disabled={status === "uploading"}
                  className="flex-1 rounded-md bg-[#06C755] py-2 text-sm font-medium text-white"
                >
                  {status === "uploading" ? "上傳中..." : "確認上傳"}
                </button>
              </>
            ) : (
              <button onClick={capture} className="w-full rounded-md bg-[#06C755] py-2 text-sm font-medium text-white">
                拍照
              </button>
            )}
          </div>
        )}
        {status === "error" && <p className="bg-white px-3 pb-2 text-xs text-red-500">{message}</p>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <p className="mt-2 text-center text-xs text-slate-400">（Demo 模擬畫面，正式版將透過 LINE LIFF 呈現）</p>
    </div>
  );
}
