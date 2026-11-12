"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

export function ActionButton({ busy, children, disabled, ...props }: ComponentProps<"button"> & { busy: string }) {
  const { pending, data } = useFormStatus();
  const active = pending && (!props.name || data?.get(props.name) === props.value);
  return <button {...props} disabled={disabled || pending}>{active ? busy : children}</button>;
}
