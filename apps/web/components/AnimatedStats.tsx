"use client";

import { useEffect, useRef, useState } from "react";

interface Stat {
  value: string;
  label: string;
}

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const duration = 1200;
          const start = performance.now();
          function frame(now: number) {
            const t = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(ease * target));
            if (t < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return <span ref={ref}>{display}{suffix}</span>;
}

export function AnimatedStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="portal-stats">
      {stats.map((s) => {
        const num = parseInt(s.value.replace(/\D/g, ""), 10);
        const suffix = s.value.replace(/[0-9]/g, "");
        const isNumeric = !isNaN(num) && num > 0;
        return (
          <div key={s.label} className="portal-stat">
            <span className="portal-stat-value">
              {isNumeric ? <AnimatedNumber target={num} suffix={suffix} /> : s.value}
            </span>
            <span className="portal-stat-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
