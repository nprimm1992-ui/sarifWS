/**
 * Atom 1.0 feed for published Praxis articles.
 *
 * Emits one entry per non-draft article from the praxis content collection.
 * The rel="alternate" link in Base.astro points here; feed aggregators and
 * Praxis subscribers expect live entries once articles publish.
 */

import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

const SITE_ORIGIN = 'https://sarifconsulting.ai';
const FEED_ID = `${SITE_ORIGIN}/praxis/`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toAtomUpdated(date: Date): string {
  return date.toISOString();
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? SITE_ORIGIN;
  const published = (await getCollection('praxis', (entry) => !entry.data.draft)).sort(
    (a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime(),
  );

  const updated =
    published.length > 0
      ? toAtomUpdated(published[0].data.publishDate)
      : toAtomUpdated(new Date('2026-04-17T00:00:00.000Z'));

  const entriesXml = published
    .map((entry) => {
      const articleUrl = `${origin}/praxis/${entry.id}/`;
      const heroUrl = entry.data.heroImage?.src
        ? new URL(entry.data.heroImage.src, origin).toString()
        : undefined;
      const categories = [entry.data.lens, ...(entry.data.tags ?? [])]
        .map((c) => `<category term="${escapeXml(c)}" />`)
        .join('\n    ');

      return `  <entry>
    <title>${escapeXml(entry.data.title)}</title>
    <id>${escapeXml(`${FEED_ID}${entry.id}`)}</id>
    <link rel="alternate" type="text/html" href="${escapeXml(articleUrl)}"/>
    <published>${toAtomUpdated(entry.data.publishDate)}</published>
    <updated>${toAtomUpdated(entry.data.publishDate)}</updated>
    <summary type="text">${escapeXml(entry.data.summary)}</summary>
    ${categories}
    ${heroUrl ? `<link rel="enclosure" type="image/svg+xml" href="${escapeXml(heroUrl)}"/>` : ''}
  </entry>`;
    })
    .join('\n\n');

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <title>Sarif Consulting — Praxis</title>
  <subtitle>Practice made public. Monthly intelligence-architecture writing.</subtitle>
  <link rel="self" href="${origin}/praxis/rss.xml"/>
  <link rel="alternate" type="text/html" href="${origin}/praxis/"/>
  <id>${FEED_ID}</id>
  <updated>${updated}</updated>
  <author>
    <name>Sarif Consulting</name>
    <email>info@sarifconsulting.ai</email>
    <uri>${origin}</uri>
  </author>
  <rights>© Sarif Consulting. All rights reserved.</rights>
  <generator uri="https://astro.build">Astro</generator>

${entriesXml || `  <!-- No published entries yet -->`}
</feed>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
};
