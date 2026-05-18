"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AGENTS_URL } from "@/lib/api";

interface TooltipData {
  entity: string;
  summary: string;
  claim_count: number;
  source_types: string[];
}

interface TooltipState {
  x: number;
  y: number;
  slug: string;
  data: TooltipData | null;
  loading: boolean;
}

export function WikiBody({ html }: { html: string }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const cache = useRef<Map<string, TooltipData>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(async (slug: string, x: number, y: number) => {
    const cached = cache.current.get(slug);
    setTooltip({ x, y, slug, data: cached ?? null, loading: !cached });
    if (cached) return;
    try {
      const res = await fetch(`${AGENTS_URL}/api/preview/${encodeURIComponent(slug)}`);
      const data: TooltipData = await res.json();
      cache.current.set(slug, data);
      setTooltip(prev => prev?.slug === slug ? { ...prev, data, loading: false } : prev);
    } catch {
      setTooltip(prev => prev?.slug === slug ? { ...prev, loading: false } : prev);
    }
  }, []);

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a.entity-link");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    const slug = href.replace("/wiki/", "");
    if (!slug) return;
    const rect = anchor.getBoundingClientRect();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => show(slug, rect.left, rect.bottom + 6), 220);
  }, [show]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTooltip(null);
  }, []);

  // Dismiss on scroll
  useEffect(() => {
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [hide]);

  return (
    <div ref={containerRef} className="wiki-body" onMouseOver={handleMouseOver} onMouseLeave={hide}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {tooltip && (
        <div
          className="entity-tooltip"
          style={{
            position: "fixed",
            top: tooltip.y,
            left: Math.min(tooltip.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 300),
            zIndex: 9999,
          }}
        >
          {tooltip.loading ? (
            <div className="entity-tooltip-loading">Loading…</div>
          ) : tooltip.data ? (
            <>
              <div className="entity-tooltip-title">{tooltip.data.entity}</div>
              <div className="entity-tooltip-summary">{tooltip.data.summary}</div>
              <div className="entity-tooltip-meta">
                {tooltip.data.claim_count} claim{tooltip.data.claim_count !== 1 ? "s" : ""}
                {tooltip.data.source_types.length > 0 && ` · ${tooltip.data.source_types.join(", ")}`}
                {" · "}
                <a href={`/wiki/${tooltip.slug}`}>open article →</a>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
