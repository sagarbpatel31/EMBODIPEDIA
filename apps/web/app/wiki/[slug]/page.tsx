import { notFound } from "next/navigation";

import { Infobox } from "@/components/Infobox";
import { fetchArticle, type Reference } from "@/lib/api";
import { renderArticleMarkdown } from "@/lib/markdown";

interface Params {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return {
    title: `${slug.replace(/_+/g, " ")} — Embodipedia`,
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

export default async function ArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const article = await fetchArticle(slug);
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
        <nav className="wiki-tabs">
          <a className="wiki-tab wiki-tab--active" href={`/wiki/${slug}`}>
            Article
          </a>
          <a className="wiki-tab" href={`/wiki/Talk:${slug}`}>
            Talk
          </a>
          <a className="wiki-tab" href={`/wiki/${slug}?action=history`}>
            History
          </a>
        </nav>
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
            See <a href={`/wiki/Talk:${slug}`}>Talk page</a> for open questions.
          </em>
        </footer>
      ) : null}
    </article>
  );
}
