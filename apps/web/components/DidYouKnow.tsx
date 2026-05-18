"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { AGENTS_URL } from "@/lib/api";

interface Fact {
  text: string;
  entity: string;
  slug: string;
  source_type: string;
}

const FALLBACK: Fact[] = [
  { text: "Figure AI unveiled Figure 03 in 2025 — successor to Figure 02 with a lower bill-of-materials and home deployment focus.", entity: "Figure 03", slug: "Figure_03", source_type: "news" },
  { text: "The Unitree G1 costs just $16,000, putting a humanoid in reach of university labs.", entity: "Unitree G1", slug: "Unitree_G1", source_type: "news" },
  { text: "π0 uses flow matching over a VLM backbone — the same scaling recipe as language models, applied to robot actions.", entity: "π0", slug: "%CF%800", source_type: "paper" },
  { text: "Apptronik's series elastic actuators were co-developed with NASA for human-safe force control.", entity: "Apptronik Apollo", slug: "Apptronik_Apollo", source_type: "news" },
  { text: "NVIDIA positioned GR00T as having an impact on humanoid robotics similar to ChatGPT's impact on language AI.", entity: "NVIDIA GR00T", slug: "NVIDIA_GR00T", source_type: "news" },
];

export function DidYouKnow() {
  const [facts, setFacts] = useState<Fact[]>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${AGENTS_URL}/api/did-you-know`)
      .then(r => r.json())
      .then(d => {
        if (d.facts?.length >= 3) {
          setFacts(d.facts);
          setLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <ul style={{ paddingLeft: "1.2rem", margin: 0, lineHeight: 1.8 }}>
      {facts.map((f, i) => (
        <li key={i}>
          <Link href={`/wiki/${f.slug}`} style={{ fontWeight: 700 }}>
            {f.entity}
          </Link>
          {": "}
          {f.text.replace(f.entity + " ", "").replace(f.entity, "")}
          {loaded && (
            <span style={{ fontSize: "0.7rem", color: "#72777d", marginLeft: "4px" }}>
              [{f.source_type}]
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
