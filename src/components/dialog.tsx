"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} className={cn("m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-ink shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className={buttonClass("ghost", "iconSm")} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Button that opens a dialog; children receive a close() callback. */
export function DialogButton({ label, title, children, variant = "secondary", size = "md", className, wide, icon }: { label: ReactNode; title: ReactNode; children: (close: () => void) => ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string; wide?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass(variant, size, className)} onClick={() => setOpen(true)}>{icon}{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} wide={wide}>{children(() => setOpen(false))}</Dialog>
    </>
  );
}
