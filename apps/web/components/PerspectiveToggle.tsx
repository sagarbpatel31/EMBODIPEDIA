"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const PERSPECTIVES = [
  { value: "canonical", label: "⚖ Canonical", desc: "Evidence-grounded ground truth" },
  { value: "bull", label: "↑ Bull", desc: "Optimistic narrative" },
  { value: "bear", label: "↓ Bear", desc: "Skeptical narrative" },
];

export function PerspectiveToggle({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(p: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (p === "canonical") {
      params.delete("perspective");
    } else {
      params.set("perspective", p);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="perspective-toggle" aria-label="Article perspective">
      <span className="perspective-toggle-label">Perspective:</span>
      {PERSPECTIVES.map((p) => {
        const active = current === p.value;
        return (
          <button
            key={p.value}
            className={`perspective-btn perspective-btn-${p.value}${active ? " active" : ""}`}
            onClick={() => switchTo(p.value)}
            disabled={isPending}
            title={p.desc}
          >
            {p.label}
          </button>
        );
      })}
      {isPending && <span className="perspective-loading">↻</span>}
    </div>
  );
}
