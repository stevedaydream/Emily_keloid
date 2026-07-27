// 純樣式工具（無 "use client"），Server Component 與 Client Component 都能直接呼叫，
// 給 <Link> 等非 <button> 元素套用跟 <Button> 一致的視覺樣式（例如導覽列的連結型按鈕）。
export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";
export type ButtonJustify = "center" | "start";

export const BUTTON_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const BUTTON_JUSTIFY: Record<ButtonJustify, string> = {
  center: "justify-center",
  start: "justify-start",
};

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  accent: "bg-accent-400 text-brand-900 hover:bg-accent-500",
  outline: "border border-brand-300 bg-white text-brand-800 hover:bg-brand-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  justify: ButtonJustify = "center",
  className = ""
) {
  return `${BUTTON_BASE} ${BUTTON_JUSTIFY[justify]} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;
}
