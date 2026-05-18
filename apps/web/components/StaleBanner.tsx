"use client";

import { useState } from "react";

import { AGENTS_URL } from "@/lib/api";

interface Props {
  slug: string;
  ageDays: number;
}

export function StaleBanner({ slug, ageDays }: Props) {
  const [state, setState] = useState<"idle" | "refreshing" | "done" | "error">(
    "idle",
  );
  const [count, setCount] = useState<number | null>(null);

  const refresh = async () => {
    setState("refreshing");
    try {
      const res = await fetch(`${AGENTS_URL}/api/refresh/${slug}`, {
        method: "POST",
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = await res.json();
      setCount(data.refreshed_claims ?? 0);
      setState("done");
      // Reload the page after a beat so the synthesizer picks up fresh metadata.
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="stale-banner">
      <span className="stale-icon">⚠</span>
      <span>
        This article&apos;s most recent claim was indexed{" "}
        <strong>{ageDays} day{ageDays === 1 ? "" : "s"} ago</strong>. Agents
        may have missed newer evidence.
      </span>
      <button
        className="stale-refresh"
        onClick={refresh}
        disabled={state === "refreshing"}
      >
        {state === "idle" && "refresh now"}
        {state === "refreshing" && "agents working…"}
        {state === "done" && `re-indexed ${count} claims · reloading…`}
        {state === "error" && "refresh failed — retry?"}
      </button>
    </div>
  );
}
