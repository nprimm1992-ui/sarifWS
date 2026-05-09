/**
 * Site-level DOM type augmentations.
 *
 * Astro's language service type-checks `<script>` blocks using the default
 * DOM lib, which does NOT include:
 *   - NetworkInformation (Save-Data / effectiveType) on Navigator
 *   - Vendor-prefixed `mozConnection` / `webkitConnection`
 *   - Ad-hoc instance flags we attach to DOM nodes to dedupe event
 *     bindings across view transitions (`_bound`, `_capTickerBound`)
 *
 * Declaring them here keeps the production code honest (no `as any` casts
 * sprinkled through .astro files) and gives autocomplete for the runtime
 * reality.
 */

interface NetworkInformation {
  readonly saveData?: boolean;
  readonly effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  readonly rtt?: number;
  readonly downlink?: number;
}

interface Navigator {
  readonly connection?: NetworkInformation;
  readonly mozConnection?: NetworkInformation;
  readonly webkitConnection?: NetworkInformation;
}

interface Element {
  /** CapabilityTicker idempotent-binding marker. */
  _capTickerBound?: boolean;
}

interface HTMLElement {
  /** Idempotent-binding marker for event listeners attached across
   *  view-transition / astro:page-load cycles. */
  _bound?: boolean;
}
