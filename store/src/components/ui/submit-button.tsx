"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./index";

/** Submit button that disables itself and shows a label while its form is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1] }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </button>
  );
}
