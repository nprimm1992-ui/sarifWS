/**
 * Fail the build when the public corpus or catalogue would teach Jensen
 * an off-site URL, an empty page, or a duplicated price.
 */
import { assertPublicArtifacts, buildCatalogue, buildCorpus } from '../src/lib/public-corpus.ts';

const corpus = buildCorpus();
const catalogue = buildCatalogue();
assertPublicArtifacts(corpus, catalogue);
console.log(
  `public corpus ok: ${corpus.count} documents, ${catalogue.deliverables.length} deliverables, version ${corpus.version.slice(0, 12)}`,
);
