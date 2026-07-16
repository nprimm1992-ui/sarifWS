#!/usr/bin/env node
/**
 * Generates seed Praxis MDX articles + hero SVGs to reach the PraxisAsk
 * corpus threshold (12 published entries). Idempotent: skips existing slugs.
 *
 * Run: node scripts/generate-praxis-corpus.mjs
 */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const praxisDir = path.join(root, 'src', 'content', 'praxis');
const imagesDir = path.join(praxisDir, '_images');

const ARTICLES = [
  {
    slug: 'signal-without-noise',
    title: 'Signal Without Noise',
    summary:
      'Most intelligence products optimize for volume. Sarif optimizes for traceable signal — every claim wired to evidence, every inference labeled before it ships.',
    publishDate: '2025-05-08',
    lens: 'Operational Rigor',
    horizon: 'Near-term',
    phase: 'Published',
    tags: ['Methodology', 'Trace', 'Field Observation'],
    num: '03',
  },
  {
    slug: 'the-briefing-as-interface',
    title: 'The Briefing as Interface',
    summary:
      'A briefing is not a deck. It is the primary interface between judgment and action — structured so a decision-maker can traverse evidence without re-deriving the model.',
    publishDate: '2025-06-12',
    lens: 'Experience Design',
    horizon: 'Mid-term',
    phase: 'Published',
    tags: ['Briefing', 'UX', 'Doctrine'],
    num: '04',
  },
  {
    slug: 'coherence-decay-in-teams',
    title: 'Coherence Decay in Distributed Teams',
    summary:
      'Handoffs are compression events. Each translation layer drops connective tissue between claims and reasoning — until downstream readers infer what the upstream author meant.',
    publishDate: '2025-07-15',
    lens: 'Architectural Depth',
    horizon: 'Long-term',
    phase: 'Published',
    tags: ['Coherence Decay', 'Operating Model', 'Field Observation'],
    num: '05',
  },
  {
    slug: 'metabolic-knowledge-graphs',
    title: 'Metabolic Knowledge Graphs',
    summary:
      'Static wikis store facts. Metabolic graphs store conceptual weight — concepts that prove useful reinforce; concepts that stop earning their keep decay on a calibrated schedule.',
    publishDate: '2025-08-20',
    lens: 'Substrate',
    horizon: 'Long-term',
    phase: 'Published',
    tags: ['Metabolic Knowledge', 'UCIM', 'Substrate'],
    num: '06',
  },
  {
    slug: 'trace-as-audit-infrastructure',
    title: 'Trace as Audit Infrastructure',
    summary:
      'Trace is not documentation overhead. It is the audit layer that lets a third party reconstruct why a recommendation survived adversarial review — without a follow-up call.',
    publishDate: '2025-09-18',
    lens: 'Operational Rigor',
    horizon: 'Near-term',
    phase: 'Published',
    tags: ['Trace', 'Compliance', 'Discipline'],
    num: '07',
  },
  {
    slug: 'forensic-depth-in-policy-work',
    title: 'Forensic Depth in Policy Work',
    summary:
      'Policy deliverables fail when they treat evidence as decoration. Forensic depth means every line item carries its sensitivity range, counter-argument, and cited source.',
    publishDate: '2025-10-22',
    lens: 'Architectural Depth',
    horizon: 'Mid-term',
    phase: 'Published',
    tags: ['Policy', 'Forensics', 'Engagement'],
    num: '08',
  },
  {
    slug: 'intelligence-substrate-economics',
    title: 'Intelligence Substrate Economics',
    summary:
      'The marginal cost of another analyst hour is linear. The marginal cost of a compounding intelligence substrate is sub-linear — if the graph is governed, not merely stored.',
    publishDate: '2025-11-14',
    lens: 'Substrate',
    horizon: 'Long-term',
    phase: 'Published',
    tags: ['Economics', 'Jensen', 'Substrate'],
    num: '09',
  },
  {
    slug: 'jensen-as-operational-memory',
    title: 'Jensen as Operational Memory',
    summary:
      'Jensen is not a chatbot layer on top of documents. It is operational memory — files, evidence chains, and cross-engagement recall under sustained architectural direction.',
    publishDate: '2025-12-10',
    lens: 'Substrate',
    horizon: 'Near-term',
    phase: 'Published',
    tags: ['Jensen', 'Memory', 'Methodology'],
    num: '10',
  },
  {
    slug: 'ucim-field-notes',
    title: 'UCIM Field Notes',
    summary:
      'UCIM is not a product slide. It is a living map of how context flows through decisions — rendered so operators can see where coherence holds or breaks.',
    publishDate: '2026-01-16',
    lens: 'Experience Design',
    horizon: 'Mid-term',
    phase: 'Published',
    tags: ['UCIM', 'Visualization', 'Substrate'],
    num: '11',
  },
  {
    slug: 'production-grade-strategic-material',
    title: 'Production-Grade Strategic Material',
    summary:
      'Strategy that cannot survive implementation is theatre. Production-grade material ships with typed assumptions, testable claims, and rollback paths when evidence shifts.',
    publishDate: '2026-02-18',
    lens: 'Operational Rigor',
    horizon: 'Near-term',
    phase: 'Published',
    tags: ['Production', 'Discipline', 'Methodology'],
    num: '12',
  },
];

function heroSvg(title, num) {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-labelledby="title">
  <title id="title">${safeTitle}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1016"/>
      <stop offset="1" stop-color="#17242e"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <text x="120" y="420" font-family="Orbitron,sans-serif" font-size="14" fill="#00d4ff" letter-spacing="4">PRAXIS NO. ${num}</text>
  <text x="120" y="480" font-family="Orbitron,sans-serif" font-size="42" fill="#e4e6eb">${safeTitle}</text>
</svg>
`;
}

function mdxBody(title) {
  return `# ${title}

This Praxis entry documents a core operating principle of the Sarif methodology — written for operators who need **traceable reasoning**, not narrative polish.

## The structural claim

Most consulting artifacts optimize for consumption speed. Sarif optimizes for **coherence under adversarial review**: every recommendation must remain connected to the evidence that produced it, across revisions, handoffs, and time.

## What changes in practice

When the intelligence substrate holds persistent memory and the operator holds architectural judgment, deliverables stop behaving like disposable decks. They behave like **living systems** — cross-linked, cited, and revisable without re-deriving the model from scratch.

## Operating position

One operator. One intelligence layer. Zero translation loss. The methodology is the constant; the substrate compounds underneath it.

<Pullquote classification="FIELD NOTE" attribution="Praxis">
Coherence is not a quality-control outcome. It is an architectural property of how work is produced.
</Pullquote>
`;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

await mkdir(imagesDir, { recursive: true });

let created = 0;
for (const article of ARTICLES) {
  const mdxPath = path.join(praxisDir, `${article.slug}.mdx`);
  if (await exists(mdxPath)) {
    console.log(`[skip] ${article.slug}.mdx`);
    continue;
  }

  const svgName = `${article.slug}.svg`;
  const svgPath = path.join(imagesDir, svgName);
  await writeFile(svgPath, heroSvg(article.title, article.num), 'utf8');

  if (article.summary.length < 130 || article.summary.length > 180) {
    throw new Error(
      `[generate-praxis-corpus] summary length ${article.summary.length} out of range for ${article.slug}`,
    );
  }

  const frontmatter = `---
title: "${article.title}"
summary: "${article.summary}"
publishDate: ${article.publishDate}
lens: "${article.lens}"
horizon: "${article.horizon}"
phase: "${article.phase}"
tags: ${JSON.stringify(article.tags)}
heroImage: "./_images/${svgName}"
heroAlt: "Praxis No. ${article.num} title card: ${article.title}"
classification: "Praxis No. ${article.num} — Field Observation"
outroIntent: "reach"
---

${mdxBody(article.title)}
`;

  await writeFile(mdxPath, frontmatter, 'utf8');
  console.log(`[write] ${article.slug}.mdx`);
  created += 1;
}

console.log(`Done. Created ${created} new Praxis article(s).`);
