"use client";

import { useMemo } from "react";

interface Node {
  id: string;
  label: string;
  kind: "entity" | "actor";
}
interface Edge {
  source: string;
  target: string;
  relation: string;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
}

// Deterministic seeded RNG so layout is stable across renders.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function EntityGraph({ nodes, edges }: Props) {
  // Pre-compute a simple force-directed-ish layout deterministically.
  const layout = useMemo(() => {
    if (nodes.length === 0) return { positions: new Map<string, [number, number]>(), w: 0, h: 0 };
    const W = 540;
    const H = 320;
    const rand = rng(nodes.length * 17 + edges.length);
    const positions = new Map<string, [number, number]>();
    // Seed positions on a circle for entities, inside for actors.
    const entities = nodes.filter((n) => n.kind === "entity");
    const actors = nodes.filter((n) => n.kind === "actor");
    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.min(W, H) / 2 - 30;
    entities.forEach((n, i) => {
      const ang = (2 * Math.PI * i) / Math.max(entities.length, 1);
      positions.set(n.id, [cx + outerR * Math.cos(ang), cy + outerR * Math.sin(ang)]);
    });
    actors.forEach((n, i) => {
      const ang = (2 * Math.PI * i) / Math.max(actors.length, 1) + Math.PI / 4;
      const innerR = outerR * 0.45 + rand() * 30;
      positions.set(n.id, [cx + innerR * Math.cos(ang), cy + innerR * Math.sin(ang)]);
    });

    // 80 iterations of mild repulsion + edge spring.
    const ids = Array.from(positions.keys());
    for (let iter = 0; iter < 80; iter++) {
      for (const a of ids) {
        const [ax, ay] = positions.get(a)!;
        let fx = 0,
          fy = 0;
        for (const b of ids) {
          if (a === b) continue;
          const [bx, by] = positions.get(b)!;
          const dx = ax - bx;
          const dy = ay - by;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = 1400 / d2;
          fx += (dx / Math.sqrt(d2)) * f;
          fy += (dy / Math.sqrt(d2)) * f;
        }
        for (const e of edges) {
          if (e.source !== a && e.target !== a) continue;
          const otherId = e.source === a ? e.target : e.source;
          const other = positions.get(otherId);
          if (!other) continue;
          const dx = other[0] - ax;
          const dy = other[1] - ay;
          fx += dx * 0.015;
          fy += dy * 0.015;
        }
        const damp = 0.18;
        positions.set(a, [
          Math.max(20, Math.min(W - 20, ax + fx * damp)),
          Math.max(20, Math.min(H - 20, ay + fy * damp)),
        ]);
      }
    }
    return { positions, w: W, h: H };
  }, [nodes, edges]);

  if (nodes.length === 0) return null;

  return (
    <div className="entity-graph">
      <div className="entity-graph-title">
        Entity graph ({nodes.length} nodes · {edges.length} edges)
      </div>
      <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className="entity-graph-svg">
        {edges.map((e, i) => {
          const a = layout.positions.get(e.source);
          const b = layout.positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              stroke="#c8d3e8"
              strokeWidth={1.2}
            />
          );
        })}
        {nodes.map((n) => {
          const p = layout.positions.get(n.id);
          if (!p) return null;
          const slug = n.id.replace(/ /g, "_");
          const isEntity = n.kind === "entity";
          return (
            <g key={n.id} transform={`translate(${p[0]}, ${p[1]})`}>
              <circle
                r={isEntity ? 8 : 5}
                fill={isEntity ? "#0645ad" : "#54595d"}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {isEntity ? (
                <a href={`/wiki/${slug}`}>
                  <text
                    y={-12}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="Helvetica, Arial, sans-serif"
                    fill="#0645ad"
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    {n.label}
                  </text>
                </a>
              ) : (
                <text
                  y={-9}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="Helvetica, Arial, sans-serif"
                  fill="#54595d"
                >
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="entity-graph-legend">
        <span className="entity-graph-legend-item">
          <span className="entity-graph-dot entity-graph-dot-entity" /> entity (click to open)
        </span>
        <span className="entity-graph-legend-item">
          <span className="entity-graph-dot entity-graph-dot-actor" /> actor / source
        </span>
      </div>
    </div>
  );
}
