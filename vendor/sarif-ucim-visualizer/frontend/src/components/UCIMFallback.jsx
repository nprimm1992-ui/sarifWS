import React from 'react';

const LABELS = [
  'Market Position', 'Competitive Landscape', 'Organizational Context',
  'Risk Architecture', 'Revenue Structure', 'Stakeholder Mapping',
  'Strategic Alignment', 'Operational Reality',
];

const NODES = [
  [78, 48], [69, 72], [50, 82], [31, 72],
  [22, 48], [31, 24], [50, 14], [69, 24],
];

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: 8 + Math.random() * 84,
  top: 8 + Math.random() * 84,
  size: 1.5 + Math.random() * 3,
  delay: Math.random() * 8,
  duration: 5 + Math.random() * 7,
  dx: -25 + Math.random() * 50,
  dy: -25 + Math.random() * 50,
}));

export default function UCIMFallback() {
  return (
    <div className="ucim-fallback" data-testid="ucim-css-fallback"
      aria-label="Universal Contextual Intelligence Matrix — Simplified Visualization">

      <div className="ucim-fb-bg" />
      <div className="ucim-fb-grid" />

      {/* SVG connections */}
      <svg className="ucim-fb-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {NODES.map(([x, y], i) => (
          <line key={`p-${i}`} x1="50" y1="50" x2={x} y2={y}
            stroke="#00d4ff" strokeWidth="0.18" strokeOpacity="0.22"
            className="ucim-fb-line-active"
            style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
        {[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6]].map(([a, b], i) => (
          <line key={`c-${i}`}
            x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]}
            stroke="#00d4ff" strokeWidth="0.1" strokeOpacity="0.12"
            className="ucim-fb-line"
            style={{ animationDelay: `${1.5 + i * 0.18}s` }} />
        ))}
      </svg>

      {/* Particles */}
      {PARTICLES.map((p) => (
        <div key={p.id} className="ucim-fb-particle" style={{
          left: `${p.left}%`, top: `${p.top}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
          '--drift-x': `${p.dx}px`, '--drift-y': `${p.dy}px`,
        }} />
      ))}

      {/* Central node — three layers */}
      <div className="ucim-fb-center" data-testid="ucim-fallback-center">
        <div className="ucim-fb-center-glow" />
        <div className="ucim-fb-center-ring" />
        <div className="ucim-fb-center-inner" />
      </div>

      {/* Orbital nodes */}
      {NODES.map(([left, top], i) => (
        <div key={i} className="ucim-fb-node"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${0.6 + i * 0.2}s` }}>
          <div className="ucim-fb-node-diamond"
            style={{ animationDelay: `${Math.random() * 2}s` }} />
          <span className="ucim-fb-node-label" data-testid="ucim-node-label">
            {LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
