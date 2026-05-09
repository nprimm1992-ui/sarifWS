/**
 * Atom 1.0 feed stub for Praxis.
 *
 * A real entry-per-issue feed will replace this once the first issue
 * publishes. Shipping the stub now claims the URL, wires up the rel-link
 * in praxis.astro, and satisfies feed-aggregator sniffers that expect a
 * response at /praxis/rss.xml when they see the <link rel="alternate">.
 */

import type { APIRoute } from 'astro';

const SITE_ORIGIN = 'https://sarifconsulting.ai';
const FEED_ID = `${SITE_ORIGIN}/praxis/`;
const UPDATED = '2026-04-17T00:00:00.000Z';

const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <title>Sarif Consulting — Praxis</title>
  <subtitle>Practice made public. Monthly intelligence-architecture writing.</subtitle>
  <link rel="self" href="${SITE_ORIGIN}/praxis/rss.xml"/>
  <link rel="alternate" type="text/html" href="${SITE_ORIGIN}/praxis/"/>
  <id>${FEED_ID}</id>
  <updated>${UPDATED}</updated>
  <author>
    <name>Sarif Consulting</name>
    <email>info@sarifconsulting.ai</email>
    <uri>${SITE_ORIGIN}</uri>
  </author>
  <rights>© Sarif Consulting. All rights reserved.</rights>
  <generator uri="https://astro.build">Astro</generator>

  <entry>
    <title>Praxis No. 01 — Coming Soon</title>
    <id>${FEED_ID}01</id>
    <link rel="alternate" type="text/html" href="${SITE_ORIGIN}/praxis/"/>
    <updated>${UPDATED}</updated>
    <summary type="text">The first issue of Praxis is in draft. Subscribe at /praxis/ to be notified on publication.</summary>
  </entry>
</feed>
`;

export const GET: APIRoute = () =>
  new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
