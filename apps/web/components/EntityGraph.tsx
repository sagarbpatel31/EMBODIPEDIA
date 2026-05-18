"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";

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

interface SimNode extends Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const W = 560;
const H = 340;
const ENTITY_R = 12;
const ACTOR_R = 7;

function initPositions(nodes: Node[]): SimNode[] {
  const cx = W / 2;
  const cy = H / 2;
  const entities = nodes.filter((n) => n.kind === "entity");
  const actors = nodes.filter((n) => n.kind === "actor");
  const outerR = Math.min(W, H) / 2 - 40;
  const result: SimNode[] = [];
  entities.forEach((n, i) => {
    const ang = (2 * Math.PI * i) / Math.max(entities.length, 1) - Math.PI / 2;
    result.push({ ...n, x: cx + outerR * Math.cos(ang), y: cy + outerR * Math.sin(ang), vx: 0, vy: 0 });
  });
  actors.forEach((n, i) => {
    const ang = (2 * Math.PI * i) / Math.max(actors.length, 1) + Math.PI / 4;
    const r = outerR * 0.45;
    result.push({ ...n, x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), vx: 0, vy: 0 });
  });
  return result;
}

export function EntityGraph({ nodes, edges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ node: SimNode; ox: number; oy: number } | null>(null);
  const hoverRef = useRef<SimNode | null>(null);

  const edgeMap = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, []);
      m.get(e.source)!.push(e);
    }
    return m;
  }, [edges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sim = simRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 8);
    ctx.fill();

    // Edges
    for (const e of edges) {
      const a = sim.find((n) => n.id === e.source);
      const b = sim.find((n) => n.id === e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(148,163,184,0.25)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Relation label at midpoint
      if (e.relation && e.relation !== "related_to") {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.font = "9px Helvetica, Arial, sans-serif";
        ctx.fillStyle = "rgba(148,163,184,0.6)";
        ctx.textAlign = "center";
        ctx.fillText(e.relation.replace(/_/g, " "), mx, my - 4);
      }
    }

    // Nodes
    for (const n of sim) {
      const isEntity = n.kind === "entity";
      const r = isEntity ? ENTITY_R : ACTOR_R;
      const isHover = hoverRef.current?.id === n.id;

      // Glow
      if (isHover) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
        const grd = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 8);
        grd.addColorStop(0, isEntity ? "rgba(59,130,246,0.4)" : "rgba(139,92,246,0.35)");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isEntity ? "#3b82f6" : "#8b5cf6";
      ctx.fill();
      ctx.strokeStyle = isEntity ? "#93c5fd" : "#c4b5fd";
      ctx.lineWidth = isHover ? 2.5 : 1.8;
      ctx.stroke();

      // Label
      ctx.font = `${isEntity ? "bold " : ""}${isEntity ? 11 : 10}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = isEntity ? "#93c5fd" : "#c4b5fd";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y - r - 5);
    }
  }, [edges]);

  const tick = useCallback(() => {
    const sim = simRef.current;
    const cx = W / 2;
    const cy = H / 2;
    const REPULSE = 1800;
    const SPRING = 0.018;
    const DAMP = 0.82;
    const CENTER = 0.004;

    for (const a of sim) {
      if (dragRef.current?.node === a) continue;
      let fx = 0, fy = 0;

      // Repulsion
      for (const b of sim) {
        if (a === b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 1;
        const f = REPULSE / d2;
        fx += (dx / Math.sqrt(d2)) * f;
        fy += (dy / Math.sqrt(d2)) * f;
      }

      // Spring along edges
      for (const e of edges) {
        if (e.source !== a.id && e.target !== a.id) continue;
        const otherId = e.source === a.id ? e.target : e.source;
        const other = sim.find((n) => n.id === otherId);
        if (!other) continue;
        fx += (other.x - a.x) * SPRING;
        fy += (other.y - a.y) * SPRING;
      }

      // Center gravity
      fx += (cx - a.x) * CENTER;
      fy += (cy - a.y) * CENTER;

      a.vx = (a.vx + fx) * DAMP;
      a.vy = (a.vy + fy) * DAMP;
      a.x = Math.max(20, Math.min(W - 20, a.x + a.vx));
      a.y = Math.max(20, Math.min(H - 20, a.y + a.vy));
    }

    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw, edges]);

  useEffect(() => {
    simRef.current = initPositions(nodes);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes, tick]);

  // Mouse interactions
  function getNodeAt(cx: number, cy: number): SimNode | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const x = (cx - rect.left) * scaleX;
    const y = (cy - rect.top) * scaleY;
    for (const n of simRef.current) {
      const r = n.kind === "entity" ? ENTITY_R : ACTOR_R;
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= (r + 6) * (r + 6)) return n;
    }
    return null;
  }

  function onMouseMove(e: React.MouseEvent) {
    const n = getNodeAt(e.clientX, e.clientY);
    hoverRef.current = n;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = n ? "pointer" : "default";
    }
    if (dragRef.current) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      dragRef.current.node.x = (e.clientX - rect.left) * scaleX;
      dragRef.current.node.y = (e.clientY - rect.top) * scaleY;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    const n = getNodeAt(e.clientX, e.clientY);
    if (n) dragRef.current = { node: n, ox: e.clientX - n.x, oy: e.clientY - n.y };
  }

  function onMouseUp(e: React.MouseEvent) {
    const wasDragging = dragRef.current;
    dragRef.current = null;
    if (!wasDragging) return;
    // Click (not drag) → navigate
    const n = getNodeAt(e.clientX, e.clientY);
    if (n && n.kind === "entity") {
      const slug = n.id.replace(/ /g, "_");
      window.open(`/wiki/${slug}`, "_blank");
    }
  }

  if (nodes.length === 0) return null;

  return (
    <div className="entity-graph">
      <div className="entity-graph-title">
        Entity graph · {nodes.length} nodes · {edges.length} edges · drag to explore · click to open
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragRef.current = null; hoverRef.current = null; }}
      />
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
