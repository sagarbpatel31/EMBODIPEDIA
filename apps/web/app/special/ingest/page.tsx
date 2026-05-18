"use client";

import { useState, useRef } from "react";
import Link from "next/link";

import { AGENTS_URL } from "@/lib/api";

const DEMO_TWEETS = [
  {
    label: "Figure 03 home deployment",
    text: `We're beginning limited home trials of Figure 03 with select beta testers. The robot can now autonomously load the dishwasher, fold laundry, and wipe counters in unstructured environments. 847 successful task completions in 30 homes over 2 weeks. This is the milestone we've been building toward. @Figure_robot`,
    author: "Brett Adcock",
    source_type: "tweet",
  },
  {
    label: "NVIDIA GR00T N3 teaser",
    text: `Excited to share that NVIDIA GR00T N3 achieves 94.2% success rate on the LIBERO benchmark suite — up from 71% in N2. The new cross-embodiment training pipeline runs on 50 robot platforms simultaneously. Shipping to partners in Q3 2026. Physical AI is accelerating faster than anyone predicted.`,
    author: "Jim Fan",
    source_type: "tweet",
  },
  {
    label: "Goldman bear note",
    text: `Goldman Sachs cuts humanoid robotics sector rating to Underweight. Key concern: unit economics remain deeply negative at current scale. Figure AI burning ~$2M/day, Tesla Optimus Gen 3 deployment delayed to 2027, and no humanoid robot has yet demonstrated 4-hour autonomous operation in an unstructured environment. The bull case requires a 10x improvement in reliability that we don't see evidence of.`,
    author: "Goldman Sachs Research",
    source_type: "news",
  },
];

const PHASES = [
  { label: "Parsing text…", pct: 15 },
  { label: "Extracting claims with GPT-4o…", pct: 40 },
  { label: "Routing to HydraDB sub-tenants…", pct: 80 },
  { label: "Indexing memories…", pct: 95 },
];

interface Claim {
  claim_text: string;
  subject_entity?: string;
  claim_type?: string;
  perspective?: string;
  confidence?: number;
  sub_tenant?: string;
}

interface IngestResult {
  claims_written: number;
  claims: Claim[];
  entities: { entity: string; slug: string }[];
}

export default function IngestPage() {
  const [text, setText] = useState(DEMO_TWEETS[0].text);
  const [author, setAuthor] = useState(DEMO_TWEETS[0].author);
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<string>(DEMO_TWEETS[0].source_type);
  const [phase, setPhase] = useState(-1);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDemo = (idx: number) => {
    const d = DEMO_TWEETS[idx];
    setText(d.text);
    setAuthor(d.author);
    setSourceType(d.source_type);
    setUrl("");
    setResult(null);
    setError(null);
    setPhase(-1);
  };

  const ingest = async () => {
    if (!text.trim()) return;
    setResult(null);
    setError(null);
    setPhase(0);

    // Advance through fake phases while real request runs.
    let p = 0;
    phaseTimer.current = setInterval(() => {
      p = Math.min(p + 1, PHASES.length - 1);
      setPhase(p);
    }, 900);

    try {
      const res = await fetch(`${AGENTS_URL}/api/ingest/quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author, url, source_type: sourceType }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const data: IngestResult = await res.json();
      clearInterval(phaseTimer.current!);
      setPhase(PHASES.length); // done
      setResult(data);
    } catch (e) {
      clearInterval(phaseTimer.current!);
      setPhase(-1);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const running = phase >= 0 && phase < PHASES.length;

  return (
    <main className="wiki-article" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 className="wiki-title" style={{ marginBottom: "0.25rem" }}>
        Live Ingest
      </h1>
      <p style={{ margin: "0 0 1.5rem", color: "#54595d", fontStyle: "italic", fontSize: "0.9rem" }}>
        Paste any tweet, news excerpt, or claim. Agents extract structured memories
        and write them to HydraDB in real time.
      </p>

      {/* Demo preset buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <span style={{ fontSize: "0.8rem", color: "#72777d", alignSelf: "center" }}>Load demo:</span>
        {DEMO_TWEETS.map((d, i) => (
          <button
            key={i}
            onClick={() => loadDemo(i)}
            className="ingest-demo-btn"
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="ingest-form">
        <div className="ingest-row">
          <label className="ingest-label">Source type</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {["tweet", "news", "general"].map(t => (
              <button
                key={t}
                onClick={() => setSourceType(t)}
                className={`ingest-type-btn ${sourceType === t ? "active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="ingest-row">
          <label className="ingest-label">Author / source</label>
          <input
            className="ingest-input"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Brett Adcock, IEEE Spectrum, etc."
          />
        </div>

        <div className="ingest-row">
          <label className="ingest-label">URL (optional)</label>
          <input
            className="ingest-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://x.com/…"
          />
        </div>

        <div className="ingest-row">
          <label className="ingest-label">Text to ingest</label>
          <textarea
            className="ingest-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            placeholder="Paste tweet text, news paragraph, or any claim…"
          />
        </div>

        <button
          className="ingest-submit"
          onClick={ingest}
          disabled={running || !text.trim()}
        >
          {running ? "Ingesting…" : "⚡ Ingest now"}
        </button>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="ingest-progress">
          <div className="ingest-progress-label">{PHASES[phase]?.label}</div>
          <div className="ingest-progress-track">
            <div
              className="ingest-progress-fill"
              style={{ width: `${PHASES[phase]?.pct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="ingest-error">
          <strong>Ingest failed:</strong> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="ingest-result">
          <div className="ingest-result-header">
            ✓ <strong>{result.claims_written} claim{result.claims_written !== 1 ? "s" : ""}</strong> indexed
            {result.entities.length > 0 && (
              <span style={{ marginLeft: "0.75rem" }}>
                → {result.entities.map((e, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    <Link href={`/wiki/${e.slug}`} className="ingest-entity-link">
                      {e.entity}
                    </Link>
                  </span>
                ))}
              </span>
            )}
            {result.entities.length > 0 && (
              <Link
                href={`/wiki/${result.entities[0].slug}`}
                className="ingest-view-btn"
              >
                View article →
              </Link>
            )}
          </div>

          <div className="ingest-claims-list">
            {result.claims.map((c, i) => {
              const persp = c.perspective || c.sub_tenant || "neutral";
              const conf = typeof c.confidence === "number"
                ? c.confidence
                : parseFloat(String(c.confidence ?? "0"));
              return (
                <div key={i} className="ingest-claim-row">
                  <div className="ingest-claim-meta">
                    <span className={`talk-pill talk-pill-${persp}`}>{persp}</span>
                    {c.claim_type && (
                      <span className="ingest-claim-type">{c.claim_type}</span>
                    )}
                    {!isNaN(conf) && conf > 0 && (
                      <span className="ingest-claim-conf">conf {conf.toFixed(2)}</span>
                    )}
                    {c.subject_entity && (
                      <Link href={`/wiki/${c.subject_entity.replace(/ /g, "_")}`} className="ingest-claim-entity">
                        {c.subject_entity}
                      </Link>
                    )}
                  </div>
                  <div className="ingest-claim-text">&ldquo;{c.claim_text}&rdquo;</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "#54595d" }}>
            Claims are now live in{" "}
            <Link href="/special/recent" style={{ color: "#0645ad" }}>Recent Changes</Link>
            {" · "}
            Talk pages updated on next synthesis run.
          </div>
        </div>
      )}
    </main>
  );
}
