import { AGENTS_URL } from "@/lib/api";

interface RecentItem {
  memory_id: string;
  sub_tenant: string;
}

interface RecentResponse {
  count: number;
  items: RecentItem[];
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

function entityFromMemoryId(mid: string): string {
  // claim_figure_02_milestone_xxx → "Figure 02"
  const parts = mid.replace(/^claim_/, "").split("_");
  if (parts.length === 0) return mid;
  const words: string[] = [];
  for (const p of parts) {
    if (
      [
        "tweet",
        "paper",
        "news",
        "transcript",
        "milestone",
        "capability",
        "deployment",
        "timeline",
        "funding",
        "partnership",
        "metric",
        "benchmark",
        "architecture",
        "strategy",
      ].includes(p)
    )
      break;
    if (/^[a-f0-9]{6,12}$/.test(p)) break;
    if (/^\d{1,3}$/.test(p)) break;
    words.push(p);
  }
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export default async function RecentChanges() {
  const data = await fetchRecent();
  const items = data?.items ?? [];

  // Group by entity for readability.
  const byEntity = new Map<string, RecentItem[]>();
  for (const it of items) {
    const e = entityFromMemoryId(it.memory_id) || "(unknown)";
    if (!byEntity.has(e)) byEntity.set(e, []);
    byEntity.get(e)!.push(it);
  }

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
            Live feed of agent-written claim ingestions across all HydraDB sub-tenants
          </p>
        </div>
      </header>

      <section className="wiki-body">
        <p>
          <strong>{data?.count ?? 0}</strong> claim memories indexed.
        </p>

        {Array.from(byEntity.entries()).length === 0 ? (
          <p>
            <em>No memories indexed yet. Run an ingest script and wait ~60s.</em>
          </p>
        ) : (
          Array.from(byEntity.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([entity, group]) => {
              const slug = entity.replace(/ /g, "_");
              const byLane = new Map<string, number>();
              for (const it of group) {
                byLane.set(it.sub_tenant, (byLane.get(it.sub_tenant) ?? 0) + 1);
              }
              return (
                <div
                  key={entity}
                  style={{
                    borderBottom: "1px solid #eaecf0",
                    padding: "0.5rem 0",
                  }}
                >
                  <a href={`/wiki/${slug}`} style={{ fontSize: "1rem" }}>
                    {entity}
                  </a>
                  <span
                    style={{
                      marginLeft: "0.6rem",
                      fontSize: "0.78rem",
                      color: "#54595d",
                    }}
                  >
                    {group.length} claim{group.length === 1 ? "" : "s"}
                  </span>
                  <span style={{ marginLeft: "0.8rem" }}>
                    {Array.from(byLane.entries()).map(([lane, count]) => (
                      <span
                        key={lane}
                        className={`talk-pill talk-pill-${lane}`}
                        style={{ marginRight: "0.3rem" }}
                      >
                        {lane}: {count}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })
        )}
      </section>
    </main>
  );
}
