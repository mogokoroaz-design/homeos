"use client";
import { useEffect, useRef } from "react";
import { openProfileAction } from "../actions";

export function OpenProfile({ next }: { next: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void openProfileAction(next);
  }, [next]);
  return <p className="text-sm text-muted">Opening HomeOS…</p>;
}
