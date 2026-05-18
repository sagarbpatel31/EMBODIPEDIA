import { notFound } from "next/navigation";

import { Infobox } from "@/components/Infobox";
import { fetchArticle, type Reference } from "@/lib/api";
import { renderArticleMarkdown } from "@/lib/markdown";

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
  return {
    title: `${isTalk ? "Talk: " : ""}${entity} — Embodipedia`,
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
    </nav>
  );
}

function TalkPageStub({ baseSlug, entity }: { baseSlug: string; entity: string }) {
  return (
    <article className="wiki-article">
      <header className="wiki-header">
        <div>
          <h1 className="wiki-title">Talk: {entity}</h1>
          <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
            Meta-discussion, debates, and open questions about <a href={`/wiki/${baseSlug}`}>{entity}</a>
          </p>
        </div>
        <ArticleTabs baseSlug={baseSlug} active="talk" />
      </header>

      <section className="wiki-body">
        <h2>Open Questions</h2>
        <p>
          Phase 3 will populate this section with claims where neither bull nor bear
          perspectives have strong evidence. Currently empty — the dual-narrative
          architecture (bull / bear / canonical sub-tenants) lands in Phase 3.
        </p>

        <h2>Active Debates</h2>
        <p>
          Phase 3 will surface bull vs. bear arguments here, each with citations.
          Click <a href={`/wiki/${baseSlug}`}>back to the article</a> while we
          finish the perspective routing.
        </p>

        <h2>Supersession Log</h2>
        <p>Claims that have been overridden by newer evidence will appear here once the contradiction daemon ships.</p>
      </section>
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
    return <TalkPageStub baseSlug={baseSlug} entity={entity} />;
  }

  const action = typeof search.action === "string" ? search.action : null;
  if (action === "history") {
    return (
      <article className="wiki-article">
        <header className="wiki-header">
          <div>
            <h1 className="wiki-title">{entity} — Edit History</h1>
            <p style={{ margin: 0, fontStyle: "italic", color: "#54595d", fontSize: "0.85rem" }}>
              Phase 4 surfaces a per-claim edit log here.
            </p>
          </div>
          <ArticleTabs baseSlug={baseSlug} active="history" />
        </header>
        <section className="wiki-body">
          <p>No revisions recorded yet. Phase 4 ships the audit log + time-travel slider.</p>
        </section>
      </article>
    );
  }

  const article = await fetchArticle(baseSlug);
  if (!article) notFound();

  const html = renderArticleMarkdown(article.markdown);

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

      <div className="wiki-main">
        <div
          className="wiki-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <Infobox entity={article.entity} references={article.references} />
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
            {article.citation_needed_count === 1 ? "" : "s"} flagged{" "}
            <span className="citation-needed-inline">[citation needed]</span>.
            See <a href={`/wiki/Talk:${baseSlug}`}>Talk page</a> for open questions.
          </em>
        </footer>
      ) : null}
    </article>
  );
}
