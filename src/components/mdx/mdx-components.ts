/**
 * MDX component registry.
 *
 * Spread this object into a Praxis MDX render call:
 *
 *   import { mdxComponents } from '../../components/mdx/mdx-components';
 *   const { Content } = await entry.render();
 *   ...
 *   <Content components={mdxComponents} />
 *
 * Keeping the registry here means adding a new MDX primitive only requires
 * one import site update, plus the component file itself.
 */
import Pullquote from './Pullquote.astro';
import Figure from './Figure.astro';
import Callout from './Callout.astro';
import Stat from './Stat.astro';
import FieldLog from './FieldLog.astro';
import Sidenote from './Sidenote.astro';
import LexiconTermLink from './LexiconTermLink.astro';
import NoLex from './NoLex.astro';

export const mdxComponents = {
  Pullquote,
  Figure,
  Callout,
  Stat,
  FieldLog,
  Sidenote,
  LexiconTermLink,
  NoLex,
} as const;

export type MdxComponentName = keyof typeof mdxComponents;
