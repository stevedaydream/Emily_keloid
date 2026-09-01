"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * 照片對齊編輯器（2026-09-02）。相簿補傳的照片沒有經過相機頁那層即時對齊框，
 * 構圖散掉之後就沒辦法跟前次的照片並排比較；這一頁讓人員在送出前把病灶挪進框內。
 *
 * **蒙板只是參照線，不是裁刀**（使用者決策 2026-09-02）：輸出的是整個方形視窗，
 * 蒙板外的東西照留。原因是拍照標準要求紙尺入鏡，若裁成蒙板大小，尺十之八九會被切掉，
 * 那張照片之後就量不出病灶大小了。所以規則是「病灶對進框內、紙尺留在視窗內」。
 */

export type AlignMaskShape = "ellipse" | "rect_landscape" | "rect_square";

/** 蒙板佔視窗的比例（寬, 高），對應 CameraCapture 即時預覽的三種蒙板 */
const MASK_BOX: Record<AlignMaskShape, { w: number; h: number }> = {
  ellipse: { w: 0.46, h: 0.66 },
  rect_landscape: { w: 0.74, h: 0.5 },
  rect_square: { w: 0.64, h: 0.64 },
};

/** 輸出邊長。相簿來源在 pickFile 已壓到長邊 2400px，方形取 1800 足夠且檔案不會太肥。 */
const OUTPUT_SIZE = 1800;

/** 旋轉後的外接矩形。決定縮放的上下界——旋轉會改變它，所以每次都要重算。 */
function boundingBox(iw: number, ih: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: iw * c + ih * s, h: iw * s + ih * c };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function PhotoAligner({
  srcUrl,
  initialShape,
  onCancel,
  onApply,
}: {
  /** 目前緩衝區裡那張照片的 dataURL（相機拍的或相簿選的都走同一個入口） */
  srcUrl: string;
  initialShape: AlignMaskShape;
  onCancel: () => void;
  /** 套用後把結果畫成一張新的 canvas 交回去，由呼叫端寫回上傳用的 canvas */
  onApply: (out: HTMLCanvasElement) => void;
}) {
  const maskId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [viewSize, setViewSize] = useState(0);
  const [shape, setShape] = useState<AlignMaskShape>(initialShape);
  // null＝還沒動過，畫面用「剛好填滿視窗」的初始倍率（見下方 scale）。
  // 不在 effect 裡 setState 初始化——那會被 react-hooks/set-state-in-effect 擋下，
  // 而且影像與視窗尺寸都是非同步才知道的，用推導的比用副作用同步的穩。
  const [rawScale, setRawScale] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // 載入來源影像
  useEffect(() => {
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = srcUrl;
  }, [srcUrl]);

  // 視窗實際寬度（方形），拿來換算顯示座標與輸出座標
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewSize(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bounds = useCallback(
    (deg: number) => {
      if (!img || !viewSize) return { fit: 1, cover: 1 };
      const b = boundingBox(img.width, img.height, deg);
      return { fit: viewSize / Math.max(b.w, b.h), cover: viewSize / Math.min(b.w, b.h) };
    },
    [img, viewSize],
  );

  /** 目前倍率：沒動過就用「未旋轉時剛好填滿視窗」的倍率 */
  const scale = rawScale ?? bounds(0).cover;
  const setScale = setRawScale;

  /** 拖曳範圍：允許拖到只剩三成畫面有影像，再多就整片空白了 */
  const clampOffset = useCallback(
    (next: { x: number; y: number }, s: number, deg: number) => {
      if (!img || !viewSize) return next;
      const b = boundingBox(img.width, img.height, deg);
      const maxX = Math.max(0, (b.w * s + viewSize) / 2 - viewSize * 0.3);
      const maxY = Math.max(0, (b.h * s + viewSize) / 2 - viewSize * 0.3);
      return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    },
    [img, viewSize],
  );

  /** 把目前的位移／縮放／旋轉畫進任意畫布。k＝目標畫布邊長 ÷ 顯示視窗邊長。 */
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, size: number, k: number) => {
      if (!img) return;
      ctx.save();
      // 縮到比視窗小的時候會露出邊，填白色讓所見即所得（送出的就是這一整塊）
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingQuality = "high";
      ctx.translate(size / 2 + offset.x * k, size / 2 + offset.y * k);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale * k, scale * k);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    },
    [img, offset, rotation, scale],
  );

  // 預覽：蒙板不畫進 canvas，是疊在上面的 SVG，才不會被烤進輸出的照片裡
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !viewSize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(viewSize * dpr);
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (ctx) paint(ctx, px, dpr);
  }, [img, viewSize, paint]);

  // ---- 手勢：單指拖曳平移、雙指捏合縮放（旋轉一律走下方控制項，避免捏合時手一歪就轉掉）----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  function pinchDistance() {
    const pts = [...pointers.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, offset };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      panStart.current = null;
      pinchStart.current = { dist: pinchDistance(), scale };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const { fit, cover } = bounds(rotation);
      const next = clamp((pinchStart.current.scale * pinchDistance()) / pinchStart.current.dist, fit, cover * 4);
      setScale(next);
      setOffset((o) => clampOffset(o, next, rotation));
      return;
    }
    if (panStart.current) {
      const s = panStart.current;
      setOffset(clampOffset({ x: s.offset.x + (e.clientX - s.x), y: s.offset.y + (e.clientY - s.y) }, scale, rotation));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  }

  function applyRotation(deg: number) {
    const next = ((((deg + 180) % 360) + 360) % 360) - 180; // 收進 -180…180
    const { fit, cover } = bounds(next);
    const s = clamp(scale, fit, cover * 4);
    setRotation(next);
    setScale(s);
    setOffset((o) => clampOffset(o, s, next));
  }

  function reset() {
    setRotation(0);
    setScale(null); // 回到「剛好填滿視窗」
    setOffset({ x: 0, y: 0 });
  }

  function apply() {
    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx || !viewSize) return;
    paint(ctx, OUTPUT_SIZE, OUTPUT_SIZE / viewSize);
    onApply(out);
  }

  const { fit, cover } = bounds(rotation);
  const box = MASK_BOX[shape];
  const maskOutline = { fill: "none", stroke: "rgba(255,255,255,0.9)", strokeWidth: 0.5, strokeDasharray: "2 1.5" };

  return (
    <div>
      <div ref={boxRef} className="relative aspect-square w-full select-none overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {/* 蒙板疊在畫面上（不會進到輸出檔）：框外壓暗、框線虛線、中心十字輔助對位 */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="100" height="100" fill="white" />
              {shape === "ellipse" ? (
                <ellipse cx="50" cy="50" rx={box.w * 50} ry={box.h * 50} fill="black" />
              ) : (
                <rect x={50 - box.w * 50} y={50 - box.h * 50} width={box.w * 100} height={box.h * 100} rx="3" fill="black" />
              )}
            </mask>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.45)" mask={`url(#${maskId})`} />
          {shape === "ellipse" ? (
            <ellipse cx="50" cy="50" rx={box.w * 50} ry={box.h * 50} vectorEffect="non-scaling-stroke" {...maskOutline} />
          ) : (
            <rect
              x={50 - box.w * 50}
              y={50 - box.h * 50}
              width={box.w * 100}
              height={box.h * 100}
              rx="3"
              vectorEffect="non-scaling-stroke"
              {...maskOutline}
            />
          )}
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
        </svg>
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-black/55 px-2 py-1 text-[11px] leading-snug text-white">
          單指拖曳、雙指縮放。<b>病灶對進框內</b>，<b>紙尺留在整個畫面內</b>（在框外沒關係，出了畫面才會被裁掉）。
        </div>
      </div>

      <div className="space-y-2.5 border-t border-slate-200 px-3 py-3">
        <label className="block">
          <span className="text-xs text-slate-500">縮放</span>
          <input
            type="range"
            min={fit}
            max={cover * 4}
            step={(cover * 4 - fit) / 200 || 0.001}
            value={scale}
            onChange={(e) => {
              const next = Number(e.target.value);
              setScale(next);
              setOffset((o) => clampOffset(o, next, rotation));
            }}
            className="mt-1 w-full"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-500">
            旋轉 <span className="tabular-nums text-slate-400">{Math.round(rotation)}°</span>
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            onChange={(e) => applyRotation(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => applyRotation(rotation - 90)} className="min-h-10 flex-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm">
            ↺ 左轉 90°
          </button>
          <button type="button" onClick={() => applyRotation(rotation + 90)} className="min-h-10 flex-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm">
            ↻ 右轉 90°
          </button>
          <button
            type="button"
            onClick={() => setShape(shape === "ellipse" ? "rect_square" : "ellipse")}
            className="min-h-10 flex-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm"
          >
            {shape === "ellipse" ? "改用方框" : "改用橢圓"}
          </button>
          <button type="button" onClick={reset} className="min-h-10 flex-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm text-slate-500">
            重設
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <button type="button" onClick={onCancel} className="flex-1 whitespace-nowrap rounded-md border border-slate-300 py-2 text-sm">
          取消
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!img}
          className="flex-1 whitespace-nowrap rounded-md bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          完成調整
        </button>
      </div>
    </div>
  );
}
