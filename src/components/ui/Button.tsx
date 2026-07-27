"use client";

import { forwardRef } from "react";
import Spinner from "./Spinner";
import { BUTTON_BASE, BUTTON_JUSTIFY, BUTTON_VARIANTS, BUTTON_SIZES, type ButtonVariant, type ButtonSize, type ButtonJustify } from "./buttonStyles";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  justify?: ButtonJustify;
  /** 呼叫中：顯示 loading 動畫並停用按鈕，避免重複點擊、也讓使用者知道系統正在處理。 */
  pending?: boolean;
  pendingText?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", justify = "center", pending = false, pendingText, className = "", children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${BUTTON_BASE} ${BUTTON_JUSTIFY[justify]} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    >
      {pending && <Spinner className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
});

export default Button;
