"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/validation";
import { Loader2 } from "lucide-react";

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingText, ...rest }: { children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string; pendingText?: string; name?: string; value?: string; title?: string; "aria-label"?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)} {...rest}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** A form bound to a server action returning ActionResult; shows errors inline. */
export function ActionForm({ action, children, className, resetOnSuccess = true, onSuccess, successMessage, id, formRef }: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  successMessage?: boolean;
  id?: string;
  formRef?: React.RefObject<HTMLFormElement | null>;
}) {
  const [state, formAction] = useActionState(action, null);
  const ownRef = useRef<HTMLFormElement>(null);
  const ref = formRef ?? ownRef;
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      {children}
      {state && !state.ok ? <p role="alert" className="mt-3 rounded-lg border border-[#55302d] bg-danger-dim px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state?.ok && successMessage && state.message ? <p className="mt-3 rounded-lg border border-[#38503f] bg-accent-dim px-3 py-2 text-sm text-accent">{state.message}</p> : null}
    </form>
  );
}

/** One-button form for simple mutations (toggle, delete) with optional confirm. */
export function InlineAction({ action, fields, children, variant = "ghost", size = "sm", className, confirm, title }: {
  action: (fd: FormData) => Promise<void | ActionResult>;
  fields?: Record<string, string | number | boolean | null | undefined>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  confirm?: string;
  title?: string;
}) {
  return (
    <form
      action={async (fd) => { await action(fd); }}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className="contents"
    >
      {Object.entries(fields ?? {}).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      <SubmitButton variant={variant} size={size} className={cn(className)} title={title} aria-label={title}>{children}</SubmitButton>
    </form>
  );
}
