import { Children, type ReactNode } from "react";

/**
 * 歷次紀錄清單只顯示最新 N 筆，其餘收進摺疊區。
 *
 * 個案頁的紀錄清單都是「越登打越長」——收案問診、治療紀錄、Lab、問卷回覆各自累積，
 * 追蹤兩年後整頁會被舊紀錄灌爆，最新的一筆反而要滑很久才找得到。
 *
 * 用 <details> 而非 useState：這些清單都在 server component 裡渲染，
 * 純 HTML 的展開不需要把整個 section 變成 client component。
 *
 * 注意：呼叫端的清單查詢必須是**新到舊**排序（`order(..., { ascending: false })`），
 * 這裡直接取前 N 筆當「最新」，不會自己排序。
 */
export default function CollapsedList({
  children,
  max = 5,
  listClassName,
  label = "紀錄",
}: {
  children: ReactNode;
  /** 收合前顯示幾筆 */
  max?: number;
  /** 摺疊區內層 <ul> 的樣式，通常與外層清單相同 */
  listClassName?: string;
  /** 摺疊提示文字裡的名詞，例如「治療紀錄」 */
  label?: string;
}) {
  const items = Children.toArray(children);
  if (items.length <= max) return <>{items}</>;

  const rest = items.slice(max);
  return (
    <>
      {items.slice(0, max)}
      <li className="pt-1">
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-900">
            <span className="group-open:hidden">▾ 顯示較早的 {rest.length} 筆{label}</span>
            <span className="hidden group-open:inline">▴ 收合較早的{label}</span>
          </summary>
          <ul className={listClassName}>{rest}</ul>
        </details>
      </li>
    </>
  );
}
