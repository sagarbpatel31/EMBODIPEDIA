import { AGENTS_URL } from "@/lib/api";

interface RichItem {
  memory_id: string;
  sub_tenant: string;
  subject_entity: string | null;
  claim_type: string | null;
  claim_text: string | null;
  confidence: string | null;
  perspective: string | null;
  source_type: string | null;
  source_url: string | null;
  actor_entity: string | null;
  published_at: string | null;
  ingested_at: string | null;
}

interface RecentResponse {
  count: number;
  items: RichItem[];
}

async function fetchRecent(): Promise<RecentResponse | null> {
  try {
    const res = await fetch(`${AGENTS_URL}/api/recent?limit=80`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RecentResponse;
  } catch {
    return null;
  }
}

function dateKey(iso: string | null): string {
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

export default async function RecentChanges() {
  const data = await fetchRecent();
  const items = data?.items ?? [];

  // Group claims by ingestion date (newest first).
  const byDate = new Map<string, RichItem[]>();
  for (const it of items) {
    const k = dateKey(it.ingested_at);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(it);
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  // Entity activity summary across all items.
  const entityCounts = new Map<string, { total: number; bull: number; bear: number; canonical: number }>();
  for (const it of items) {
    const e = it.subject_entity ?? "(unknown)";
    const v =
      entityCounts.get(e) ?? { total: 0, bull: 0, bear: 0, canonical: 0 };
    v.total++;
    if (it.sub_tenant === "bull") v.bull++;
    if (it.sub_tenant === "bear") v.bear++;
    if (it.sub_tenant === "canonical") v.canonical++;
    entityCounts.set(e, v);
  }
  const topEntities = Array.from(entityCounts.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);

  return (
    <main className="wiki-article">
      <header className="wiki-header">
        <div>
          <h1 className="wiki-title">Special: Recent Changes</h1>
          <p
            style={{
              margin: 0,
              fontStyle: "italic",
              color: "#54595d",
              fontSize: "0.85rem",
            }}
          >
            Live feed of agent-written claims across canonical / bull / bear
            sub-tenants, sorted newest first.
          </p>
        </div>
      </header>

      <div className="talk-perspective-bar">
        <span className="talk-pill talk-pill-info">{items.length} claims</span>
        <span className="talk-pill talk-pill-info">{dates.length} ingestion days</span>
        <span className="talk-pill talk-pill-info">{entityCounts.size} distinct entities</span>
      </div>

      {/* Activity summary */}
      <section className="wiki-body" style={{ marginBottom: "1.5rem" }}>
        <h2>Top entities by recent activity</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {topEntities.map(([entity, v]) => {
            const slug = entity.replace(/ /g, "_");
            return (
              <li
                key={entity}
                style={{ padding: "0.3rem 0", borderBottom: "1px solid #eaecf0" }}
              >
                <a href={`/wiki/${slug}`} style={{ fontSize: "0.95rem" }}>
                  {entity}
                </a>
                <span style={{ marginLeft: "0.7rem", fontSize: "0.78rem", color: "#54595d" }}>
                  {v.total} total
                </span>
                {v.canonical > 0 && (
                  <span className="talk-pill talk-pill-canonical" style={{ marginLeft: "0.4rem" }}>
                    canonical {v.canonical}
                  </span>
                )}
                {v.bull > 0 && (
                  <span className="talk-pill talk-pill-bull" style={{ marginLeft: "0.4rem" }}>
                    bull {v.bull}
                  </span>
                )}
                {v.bear > 0 && (
                  <span className="talk-pill talk-pill-bear" style={{ marginLeft: "0.4rem" }}>
                    bear {v.bear}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Date-grouped feed */}
      {dates.map((d) => (
        <section key={d} className="recent-day">
          <h2 className="recent-day-title">{d}</h2>
          {byDate.get(d)!.map((it) => {
            const slug = (it.subject_entity ?? "").replace(/ /g, "_");
            return (
              <div key={it.memory_id} className="history-row">
                <div className="history-row-meta">
                  <span className="history-row-time">
                    {it.ingested_at ? it.ingested_at.slice(11, 19) + "Z" : "—"}
                  </span>
                  <span className={`talk-pill talk-pill-${it.sub_tenant}`}>
                    {it.sub_tenant}
                  </span>
                  {it.perspective && it.perspective !== it.sub_tenant && (
                    <span className={`talk-pill talk-pill-${it.perspective}`}>
                      {it.perspective}
                    </span>
                  )}
                  <a href={`/wiki/${slug}`}>{it.subject_entity}</a>
                  <span className="history-row-claimtype">{it.claim_type}</span>
                  {it.confidence && (
                    <span className="history-row-conf">
                      conf {parseFloat(it.confidence).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="history-row-text">{it.claim_text}</div>
                <div className="history-row-source">
                  {it.actor_entity && <span>{it.actor_entity} · </span>}
                  {it.source_url ? (
                    <a href={it.source_url} target="_blank" rel="noopener noreferrer">
                      {it.source_type || "source"}
                    </a>
                  ) : null}
                  {it.published_at && (
                    <span> · published {it.published_at.slice(0, 10)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {items.length === 0 && (
        <section className="wiki-body">
          <p>
            <em>No memories indexed yet. Run an ingest script and wait ~60s.</em>
          </p>
        </section>
      )}
    </main>
  );
}
