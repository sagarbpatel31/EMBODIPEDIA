"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

// Pre-cached snapshot dates spanning the humanoid robotics era.
const SNAPSHOTS = [
  { label: "Jan 2023", date: "2023-01-31" },
  { label: "Jan 2024", date: "2024-01-31" },
  { label: "Jul 2024", date: "2024-07-31" },
  { label: "Jan 2025", date: "2025-01-31" },
  { label: "Now", date: "" },
];

export function TimeTravelSlider() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAsOf = searchParams.get("as_of") || "";
  const [, startTransition] = useTransition();
  const [hovered, setHovered] = useState<number | null>(null);

  const currentIdx = SNAPSHOTS.findIndex((s) => s.date === currentAsOf);
  const activeIdx = currentIdx >= 0 ? currentIdx : SNAPSHOTS.length - 1;

  const navigate = (idx: number) => {
    const snap = SNAPSHOTS[idx];
    const params = new URLSearchParams(searchParams.toString());
    if (snap.date) {
      params.set("as_of", snap.date);
    } else {
      params.delete("as_of");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? "?" + qs : ""}`);
    });
  };

  return (
    <div className="time-travel">
      <div className="time-travel-label">
        <span className="time-travel-icon">⏱</span>
        <span>Time-travel:</span>
        <strong>{SNAPSHOTS[hovered ?? activeIdx].label}</strong>
        {currentAsOf && (
          <span className="time-travel-note">
            (claims published after this date are hidden)
          </span>
        )}
      </div>
      <div className="time-travel-track">
        {SNAPSHOTS.map((s, i) => (
          <button
            key={s.date || "now"}
            className={`time-travel-stop${i === activeIdx ? " active" : ""}${
              i <= activeIdx ? " filled" : ""
            }`}
            onClick={() => navigate(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`Time-travel to ${s.label}`}
          >
            <span className="time-travel-dot" />
            <span className="time-travel-stop-label">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
