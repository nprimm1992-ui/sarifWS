/** Page awareness. Pure: the caller passes the location and title. */

const SKU = /^[a-z0-9-]{1,64}$/;
const KNOWN = ['services', 'praxis', 'lexicon', 'contact', 'engagements', 'about'];
const SKU_LIMIT = 28;

const STARTERS = {
  services: [
    'What does a Strategic Diagnostic include?',
    'How are fees structured?',
    'How does a first engagement start?',
  ],
  praxis: [
    'What is the point of this essay?',
    'How does this show up in an engagement?',
    'Which lexicon terms does this rely on?',
  ],
  lexicon: [
    'What does this term mean here?',
    'Where else does this idea appear?',
    'How is this used in an engagement?',
  ],
  contact: [
    'What should a transmission include?',
    'What happens after I send one?',
    'What can Jensen answer before I write?',
  ],
  engagements: [
    'What is this engagement an example of?',
    'Which services does this draw on?',
    'How would a first engagement start?',
  ],
  about: [
    'What does Sarif actually do?',
    'Who does the work?',
    'How do I scope a first engagement?',
  ],
  site: [
    'What does Sarif actually do?',
    'How do I scope a first engagement?',
    'What is Jensen?',
  ],
};

export function pageSection(pathname) {
  const segment = String(pathname || '/').split('/').filter(Boolean)[0];
  return KNOWN.includes(segment) ? segment : 'site';
}

export function pageTitle(title) {
  const raw = String(title || '').trim();
  const withoutTail = raw.replace(/\s+(?:—|–|-)\s+Sarif Consulting\s*$/i, '').trim();
  const withoutLead = withoutTail.replace(/^Sarif Consulting\s+(?:—|–|-)\s+/i, '').trim();
  return withoutLead || 'Sarif';
}

export function starterPrompts(pathname) {
  return STARTERS[pageSection(pathname)].slice();
}

export function pageContext(pathname, title) {
  const section = pageSection(pathname);
  return {
    path: pathname || '/',
    title: pageTitle(title),
    section,
    starters: STARTERS[section].slice(),
  };
}

export function scopeSkusFrom(search, stored) {
  const params = new URLSearchParams(search || '');
  const fromUrl = params.getAll('scope').flatMap((value) => value.split('|'));
  const fromStore = String(stored || '').split('|');
  return [...new Set([...fromUrl, ...fromStore].filter((sku) => SKU.test(sku)))].slice(0, SKU_LIMIT);
}
