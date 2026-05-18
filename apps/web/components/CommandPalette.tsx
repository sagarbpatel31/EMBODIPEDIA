"use client";

import { useEffect, useRef, useState } from "react";

import { AGENTS_URL } from "@/lib/api";
import { EntityGraph } from "./EntityGraph";

interface Chunk {
  footnote_id: number;
  subject_entity: string | null;
  claim_text: string | null;
  source_url: string | null;
  source_type: string | null;
  actor_entity: string | null;
}

interface GraphNode { id: string; label: string; kind: "entity" | "actor" }
interface GraphEdge { source: string; target: string; relation: string }

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global Cmd+K / Ctrl+K listener.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const submit = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setChunks([]);
    setGraph(null);
    try {
      const res = await fetch(`${AGENTS_URL}/api/ask?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setAnswer(data.answer || "");
        setChunks(data.chunks || []);
        if (data.entity_paths && data.entity_paths.nodes) {
          setGraph(data.entity_paths);
        }
      } else {
        setAnswer("_Backend error — is the FastAPI service up on :8000?_");
      }
    } catch {
      setAnswer("_Network error — is the FastAPI service up on :8000?_");
    } finally {
      setLoading(false);
    }
  };

  // Convert [^N] footnote markers in the answer into clickable jumps.
  const renderAnswer = (md: string): string => {
    return md.replace(/\[\^(\d+)\]/g, (_m, n) =>
      `<sup class="cmdk-cite"><a href="#cmdk-cite-${n}">[${n}]</a></sup>`
    );
  };

  if (!open) {
    return (
      <button
        className="cmdk-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (⌘K)"
      >
        <span className="cmdk-launcher-icon">⌘K</span>
        <span className="cmdk-launcher-label">Ask Embodipedia anything…</span>
      </button>
    );
  }

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-prefix">/ask</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="How is Karol Hausman connected to Skild?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button className="cmdk-submit" onClick={submit} disabled={loading}>
            {loading ? "thinking…" : "ask ↵"}
          </button>
        </div>
        <div className="cmdk-hint">
          Cmd+K toggles · Esc closes · Powered by HydraDB hybrid recall + GPT-4o
        </div>

        {(answer || chunks.length > 0) && (
          <div className="cmdk-results">
            {answer && (
              <div
                className="cmdk-answer"
                dangerouslySetInnerHTML={{ __html: renderAnswer(answer) }}
              />
            )}
            {graph && graph.nodes.length > 1 && (
              <EntityGraph nodes={graph.nodes} edges={graph.edges} />
            )}
            {chunks.length > 0 && (
              <div className="cmdk-chunks">
                <div className="cmdk-chunks-title">Sources</div>
                {chunks.map((c) => (
                  <div
                    key={c.footnote_id}
                    id={`cmdk-cite-${c.footnote_id}`}
                    className="cmdk-chunk"
                  >
                    <span className="cmdk-chunk-id">[{c.footnote_id}]</span>{" "}
                    <strong>{c.subject_entity}</strong>{" "}
                    <span className="cmdk-chunk-meta">
                      ({c.source_type}
                      {c.actor_entity ? ` · ${c.actor_entity}` : ""})
                    </span>
                    <div className="cmdk-chunk-text">{c.claim_text}</div>
                    {c.source_url && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cmdk-chunk-link"
                      >
                        view source →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
