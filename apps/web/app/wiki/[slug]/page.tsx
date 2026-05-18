import { notFound } from "next/navigation";

import { Infobox } from "@/components/Infobox";
import { PerspectiveToggle } from "@/components/PerspectiveToggle";
import { StaleBanner } from "@/components/StaleBanner";
import { TimeTravelSlider } from "@/components/TimeTravelSlider";
import { WikiBody } from "@/components/WikiBody";
import {
  fetchArticle,
  fetchHistory,
  fetchTalkPage,
  type HistoryEntry,
  type Reference,
} from "@/lib/api";
import { renderArticleMarkdown } from "@/lib/markdown";

function QualityBadge({ quality }: { quality?: string | null }) {
  if (!quality || quality === "empty") return null;
  return (
    <span className={`quality-badge quality-${quality}`}>
      {quality === "featured" && "★ Featured article"}
      {quality === "good" && "✓ Good article"}
      {quality === "stub" && "Stub"}
    </span>
  );
}

function dayDiff(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

interface Params {
  slug: string;
}

// Strip any leading Talk:/History:/Special: prefixes so accidental clicks
// don't accumulate (e.g. /wiki/Talk:Talk:Figure_02 → "Figure_02").
function parseSlug(slug: string): { base: string; isTalk: boolean; isHistory: boolean } {
  let cleaned = slug;
  let isTalk = false;
  let isHistory = false;
  // Decode in case the URL got percent-encoded.
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    /* ignore */
  }
  while (true) {
    if (cleaned.startsWith("Talk:")) {
      cleaned = cleaned.slice(5);
      isTalk = true;
    } else if (cleaned.startsWith("History:")) {
      cleaned = cleaned.slice(8);
      isHistory = true;
    } else {
      break;
    }
  }
  return { base: cleaned, isTalk, isHistory };
}

function slugToEntity(s: string): string {
  return s.replace(/_+/g, " ").trim();
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const { base, isTalk } = parseSlug(slug);
  const entity = slugToEntity(base);
  const title = `${isTalk ? "Talk: " : ""}${entity} — Embodipedia`;
  const description = `${entity} — AI-synthesized encyclopedia article with citations, bull/bear perspectives, and live claim tracing. From Embodipedia, the Wikipedia of humanoid robotics.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Embodipedia",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

function formatSourceLabel(ref: Reference): string {
  if (ref.source_type === "tweet") return "tweet";
  if (ref.source_type === "paper") return "paper";
  if (ref.source_type === "news") return "news";
  if (ref.source_type === "podcast" || ref.source_type === "transcript")
    return "transcript";
  return ref.source_type ?? "source";
}

function confidenceBadge(c: string | number | null): string | null {
  if (c == null) return null;
  const num = typeof c === "string" ? parseFloat(c) : c;
  if (Number.isNaN(num)) return null;
  if (num >= 0.85) return "high";
  if (num >= 0.7) return "medium";
  return "low";
}

function ArticleTabs({
  baseSlug,
  active,
}: {
  baseSlug: string;
  active: "article" | "talk" | "history";
}) {
  const cls = (key: typeof active) =>
    `wiki-tab${active === key ? " wiki-tab--active" : ""}`;
  return (
    <nav className="wiki-tabs">
      <a className={cls("article")} href={`/wiki/${baseSlug}`}>
        Article
      </a>
      <a className={cls("talk")} href={`/wiki/Talk:${baseSlug}`}>
        Talk
      </a>
      <a className={cls("history")} href={`/wiki/${baseSlug}?action=history`}>
        History
      </a>
      <a className="wiki-tab" href={`/special/links/${baseSlug}`}>
        What links here
      </a>
    </nav>
  );
}

async function TalkPage({ baseSlug, entity }: { baseSlug: string; entity: string }) {
  const talk = await fetchTalkPage(baseSlug);
  const md = talk?.markdown ?? `*Failed to load Talk page for ${entity}.*`;
  const html = renderArticleMarkdown(md, talk?.references as Reference[] | undefined);

  return (
    <article className="wiki-article">
      <header className="wiki-header">
        <div>
          <h1 className="wiki-title">Talk: {entity}</h1>
          <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
            Meta-discussion, debates, and open questions about{" "}
            <a href={`/wiki/${baseSlug}`}>{entity}</a>
          </p>
        </div>
        <ArticleTabs baseSlug={baseSlug} active="talk" />
      </header>

      {/* Evidence scoreboard */}
      {talk && (talk.bull_count > 0 || talk.bear_count > 0) && (() => {
        const total = talk.bull_count + talk.bear_count;
        const bullPct = total > 0 ? Math.round((talk.bull_count / total) * 100) : 50;
        const bearPct = 100 - bullPct;
        return (
          <div className="talk-scoreboard">
            <div className="talk-scoreboard-header">
              <span className="talk-score-bull">↑ Bull · {talk.bull_count} claims</span>
              <span className="talk-score-label">Evidence battle</span>
              <span className="talk-score-bear">{talk.bear_count} claims · Bear ↓</span>
            </div>
            <div className="talk-scoreboard-bar">
              <div className="talk-scoreboard-bull" style={{ width: `${bullPct}%` }}>
                {bullPct > 12 && `${bullPct}%`}
              </div>
              <div className="talk-scoreboard-bear" style={{ width: `${bearPct}%` }}>
                {bearPct > 12 && `${bearPct}%`}
              </div>
            </div>
          </div>
        );
      })()}
      <div className="talk-perspective-bar">
        <span className="talk-pill talk-pill-bull">{talk?.bull_count ?? 0} bull claims</span>
        <span className="talk-pill talk-pill-bear">{talk?.bear_count ?? 0} bear claims</span>
        <span className="talk-pill talk-pill-info">
          dual-narrative routing via HydraDB sub-tenants
        </span>
      </div>

      <div className="wiki-body" dangerouslySetInnerHTML={{ __html: html }} />

      {talk?.references?.length ? (
        <section className="wiki-references">
          <h2>References</h2>
          <ol>
            {talk.references.map((ref, idx) => {
              const id = ref.footnote_id ?? idx + 1;
              const persp = ref.perspective || "";
              return (
                <li id={`cite-${id}`} key={`talk-${id}-${idx}`}>
                  <span className="wiki-ref-jump">
                    <a href={`#ref-${id}`} aria-label={`Jump back to citation ${id}`}>↑</a>
                  </span>{" "}
                  {persp ? <span className={`talk-pill talk-pill-${persp}`}>{persp}</span> : null}{" "}
                  {ref.actor_entity ? <span>{ref.actor_entity}, </span> : null}
                  {ref.source_url ? (
                    <a href={ref.source_url} target="_blank" rel="noopener noreferrer">
                      {ref.source_type || "source"}
                    </a>
                  ) : (
                    <span>(no URL)</span>
                  )}
                  {ref.published_at ? (
                    <span className="wiki-ref-date"> · {ref.published_at.slice(0, 10)}</span>
                  ) : null}
                  {ref.claim_text ? (
                    <span className="wiki-ref-claim"> — &ldquo;{ref.claim_text}&rdquo;</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </article>
  );
}

export default async function WikiSlugPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { base, isTalk } = parseSlug(slug);
  const baseSlug = base;
  const entity = slugToEntity(base);

  if (isTalk) {
    return <TalkPage baseSlug={baseSlug} entity={entity} />;
  }

  const action = typeof search.action === "string" ? search.action : null;
  if (action === "history") {
    const history = await fetchHistory(baseSlug);
    const entries: HistoryEntry[] = history?.entries ?? [];
    const sourceCounts = new Map<string, number>();
    for (const e of entries) {
      const k = e.source_type || "?";
      sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1);
    }
    return (
      <article className="wiki-article">
        <header className="wiki-header">
          <div>
            <h1 className="wiki-title">{entity} — Revision History</h1>
            <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
              Every claim memory ingested by agents, sorted newest first
            </p>
          </div>
          <ArticleTabs baseSlug={baseSlug} active="history" />
        </header>

        <div className="talk-perspective-bar">
          <span className="talk-pill talk-pill-info">{entries.length} claim revisions</span>
          {Array.from(sourceCounts.entries()).map(([src, n]) => (
            <span key={src} className="talk-pill talk-pill-canonical">
              {src}: {n}
            </span>
          ))}
        </div>

        {entries.length === 0 ? (
          <section className="wiki-body">
            <p><em>No revisions found. Agents haven&apos;t ingested any claims for this entity yet.</em></p>
          </section>
        ) : (
          <section className="history-list">
            {entries.map((e) => (
              <div key={e.memory_id} className="history-row">
                <div className="history-row-meta">
                  <span className="history-row-time">
                    {e.ingested_at ? e.ingested_at.slice(0, 19).replace("T", " ") + "Z" : "—"}
                  </span>
                  <span className={`talk-pill talk-pill-${e.sub_tenant}`}>{e.sub_tenant}</span>
                  {e.perspective && e.perspective !== e.sub_tenant ? (
                    <span className={`talk-pill talk-pill-${e.perspective}`}>{e.perspective}</span>
                  ) : null}
                  <span className="history-row-claimtype">{e.claim_type}</span>
                  {e.confidence ? (
                    <span className="history-row-conf">conf {parseFloat(e.confidence).toFixed(2)}</span>
                  ) : null}
                </div>
                <div className="history-row-text">{e.claim_text}</div>
                <div className="history-row-source">
                  {e.actor_entity ? <span>{e.actor_entity} · </span> : null}
                  {e.source_url ? (
                    <a href={e.source_url} target="_blank" rel="noopener noreferrer">
                      {e.source_type || "source"}
                    </a>
                  ) : null}
                  {e.published_at ? (
                    <span> · published {e.published_at.slice(0, 10)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        )}
      </article>
    );
  }

  const asOf = typeof search.as_of === "string" ? search.as_of : null;
  const perspective = typeof search.perspective === "string" ? search.perspective : null;
  const article = await fetchArticle(baseSlug, asOf, perspective);
  if (!article) notFound();

  // Empty article — no claims yet, show stub notice before rendering.
  if (article.quality === "empty" || (article.claim_count ?? 0) === 0) {
    return (
      <article className="wiki-article">
        <header className="wiki-header">
          <div>
            <h1 className="wiki-title">{article.entity}</h1>
            <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
              From Embodipedia, the encyclopedia of humanoid robotics
            </p>
          </div>
          <ArticleTabs baseSlug={baseSlug} active="article" />
        </header>
        <div className="stub-notice">
          <div className="stub-notice-icon">🤖</div>
          <div>
            <strong>Agents haven&apos;t written this article yet.</strong>
            <p>No claims have been ingested for <em>{article.entity}</em>. Be the first to teach Embodipedia about this entity.</p>
            <a href="/special/ingest" className="stub-notice-btn">⚡ Ingest a source now</a>
          </div>
        </div>
      </article>
    );
  }

  const html = renderArticleMarkdown(article.markdown, article.references, article.entity);
  const age = dayDiff(article.last_ingested_at);
  const activePerspective = perspective || "canonical";
  // Demo-friendly stale threshold (article older than this triggers banner).
  const STALE_THRESHOLD_DAYS = 14;

  return (
    <article className="wiki-article">
      <header className="wiki-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" }}>
            <h1 className="wiki-title">{article.entity}</h1>
            <QualityBadge quality={article.quality} />
          </div>
          <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
            From Embodipedia, the encyclopedia of humanoid robotics
            {article.claim_count != null && (
              <>
                {" · "}{article.claim_count} claim{article.claim_count === 1 ? "" : "s"}
                {" · "}{article.primary_source_count ?? 0} primary source
                {(article.primary_source_count ?? 0) === 1 ? "" : "s"}
                {article.source_type_counts && Object.keys(article.source_type_counts).length > 0 && (
                  <> · {Object.entries(article.source_type_counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => `${n} ${t}`)
                    .join(", ")}</>
                )}
              </>
            )}
          </p>
        </div>
        <ArticleTabs baseSlug={baseSlug} active="article" />
      </header>

      <PerspectiveToggle current={activePerspective} />
      <TimeTravelSlider />

      {age != null && age >= STALE_THRESHOLD_DAYS && (
        <StaleBanner slug={baseSlug} ageDays={age} />
      )}

      {perspective === "bull" && (
        <div className="perspective-notice perspective-notice-bull">
          ↑ <strong>Bull perspective:</strong> This article is synthesized from optimistic,
          growth-oriented claims. Bear and neutral claims are excluded.{" "}
          <a href={`/wiki/${baseSlug}`}>Switch to balanced view</a>
        </div>
      )}
      {perspective === "bear" && (
        <div className="perspective-notice perspective-notice-bear">
          ↓ <strong>Bear perspective:</strong> This article is synthesized from skeptical,
          risk-focused claims. Bull and neutral claims are excluded.{" "}
          <a href={`/wiki/${baseSlug}`}>Switch to balanced view</a>
        </div>
      )}
      {asOf && (
        <div className="time-warp-notice">
          ⏳ Viewing article as it would have appeared on or before{" "}
          <strong>{asOf}</strong>. {article.claim_count ?? 0} of total claims survive
          this time filter. <a href={`/wiki/${baseSlug}`}>back to present</a>
        </div>
      )}

      <div className="wiki-main">
        <WikiBody html={html} />
        <Infobox entity={article.entity} references={article.references} />
      </div>

      <div className="conf-legend">
        <span className="conf-legend-label">Confidence:</span>
        <span className="conf-legend-item"><span className="conf-dot conf-dot-high" />≥ 0.85 high</span>
        <span className="conf-legend-item"><span className="conf-dot conf-dot-med" />0.70–0.84 medium</span>
        <span className="conf-legend-item"><span className="conf-dot conf-dot-low" />&lt; 0.70 low</span>
      </div>

      <section className="wiki-references">
        <h2>References</h2>
        <ol>
          {article.references.map((ref: Reference, idx) => {
            const id = ref.footnote_id ?? idx + 1;
            const badge = confidenceBadge(ref.confidence);
            return (
              <li id={`cite-${id}`} key={`${id}-${idx}`}>
                <span className="wiki-ref-jump">
                  <a href={`#ref-${id}`} aria-label={`Jump back to citation ${id}`}>↑</a>
                </span>{" "}
                {ref.actor_entity ? <span>{ref.actor_entity}, </span> : null}
                {ref.source_url ? (
                  <a href={ref.source_url} target="_blank" rel="noopener noreferrer">
                    {formatSourceLabel(ref)}
                  </a>
                ) : (
                  <span>(no URL)</span>
                )}
                {ref.published_at ? (
                  <span className="wiki-ref-date"> · {ref.published_at.slice(0, 10)}</span>
                ) : null}
                {badge ? (
                  <span className="wiki-ref-conf"> · confidence: {badge}</span>
                ) : null}
                {ref.claim_text ? (
                  <span className="wiki-ref-claim"> — &ldquo;{ref.claim_text}&rdquo;</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {article.citation_needed_count > 0 ? (
        <footer className="wiki-meta">
          <em>
            {article.citation_needed_count} claim
            {article.citation_needed_count === 1 ? "" : "s"} marked{" "}
            <span className="badge-unverified">unverified</span>.{" "}
            <a href={`/wiki/Talk:${baseSlug}`}>Open the Talk page</a> to see the
            evidence gap.
          </em>
        </footer>
      ) : null}
    </article>
  );
}
