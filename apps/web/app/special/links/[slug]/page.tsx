import { fetchWhatLinksHere } from "@/lib/api";

interface Params {
  slug: string;
}

export default async function WhatLinksHerePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const data = await fetchWhatLinksHere(decoded);

  return (
    <main className="wiki-article">
      <header className="wiki-header">
        <div>
          <h1 className="wiki-title">
            What links here: <em>{data?.entity ?? decoded.replace(/_/g, " ")}</em>
          </h1>
          <p
            style={{
              margin: 0,
              fontStyle: "italic",
              color: "#54595d",
              fontSize: "0.85rem",
            }}
          >
            Other entity articles whose claims mention this entity — derived
            from HydraDB global recall + content match.
          </p>
        </div>
      </header>

      <div className="talk-perspective-bar">
        <span className="talk-pill talk-pill-info">
          {data?.incoming.length ?? 0} entities
        </span>
        <span className="talk-pill talk-pill-info">
          {data?.total ?? 0} total references
        </span>
      </div>

      {(!data || data.incoming.length === 0) && (
        <section className="wiki-body">
          <p>
            <em>
              No other entities reference {decoded.replace(/_/g, " ")} yet.
              Run the seed ingest scripts and revisit.
            </em>
          </p>
        </section>
      )}

      {data &&
        data.incoming.map((row) => (
          <section key={row.subject_entity} className="links-section">
            <h2>
              <a href={`/wiki/${row.slug}`}>{row.subject_entity}</a>
              <span className="links-count">
                {row.count} mention{row.count === 1 ? "" : "s"}
              </span>
            </h2>
            {row.mentions.map((m, i) => (
              <div key={i} className="links-mention">
                <div className="links-mention-text">&ldquo;{m.claim_text}&rdquo;</div>
                <div className="links-mention-meta">
                  {m.perspective ? (
                    <span className={`talk-pill talk-pill-${m.perspective}`}>
                      {m.perspective}
                    </span>
                  ) : null}{" "}
                  {m.source_url ? (
                    <a href={m.source_url} target="_blank" rel="noopener noreferrer">
                      {m.source_type || "source"}
                    </a>
                  ) : null}
                  {m.confidence ? (
                    <span style={{ marginLeft: "0.5rem", color: "#54595d" }}>
                      confidence {parseFloat(m.confidence).toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ))}
    </main>
  );
}
