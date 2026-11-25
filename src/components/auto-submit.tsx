"use client";
import type { ComponentProps } from "react";

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** An <input> that submits its form when it loses focus with a changed value. */
export function AutoSubmitInput(props: ComponentProps<"input">) {
  return <input {...props} onBlur={(e) => { if (e.currentTarget.value !== String(props.defaultValue ?? "")) e.currentTarget.form?.requestSubmit(); }} />;
}
