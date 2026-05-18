import type { Reference } from "@/lib/api";

interface InfoboxProps {
  entity: string;
  references: Reference[];
}

// Derive a few infobox facts from the strongest references.
// Phase 1: stub — picks "first known mention" / actor / source breakdown.
// Phase 2 will replace this with structured lexical recall on canonical fields.
function buildFacts(refs: Reference[]): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  if (!refs.length) return facts;

  const actors = new Set<string>();
  const sourceTypes = new Set<string>();
  let earliest: string | null = null;

  for (const r of refs) {
    if (r.actor_entity) actors.add(r.actor_entity);
    if (r.source_type) sourceTypes.add(r.source_type);
    if (r.published_at) {
      if (!earliest || r.published_at < earliest) earliest = r.published_at;
    }
  }

  if (actors.size) {
    facts.push({ label: "Primary actor", value: Array.from(actors).slice(0, 3).join(", ") });
  }
  if (earliest) {
    facts.push({ label: "First mention", value: earliest.slice(0, 10) });
  }
  if (sourceTypes.size) {
    facts.push({ label: "Source types", value: Array.from(sourceTypes).join(", ") });
  }
  facts.push({ label: "References", value: String(refs.length) });

  return facts;
}

export function Infobox({ entity, references }: InfoboxProps) {
  const facts = buildFacts(references);
  return (
    <aside className="wiki-infobox" aria-label={`Infobox for ${entity}`}>
      <div className="wiki-infobox-title">{entity}</div>
      <div className="wiki-infobox-sub">Humanoid robotics — Embodipedia</div>
      <table>
        <tbody>
          {facts.map((f) => (
            <tr key={f.label}>
              <th scope="row">{f.label}</th>
              <td>{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
