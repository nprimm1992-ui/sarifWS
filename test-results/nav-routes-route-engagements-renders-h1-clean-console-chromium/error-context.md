# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-routes.spec.ts >> route /engagements/ renders h1 + clean console
- Location: tests\e2e\nav-routes.spec.ts:32:3

# Error details

```
Error: console errors on /engagements/

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+ ]
```

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2]:
    - /url: "#main-content"
  - banner [ref=e4]:
    - navigation "Main navigation" [ref=e5]:
      - link "Sarif Consulting — Home" [ref=e6]:
        - /url: /
        - text: SARIF CONSULTING
      - list [ref=e7]:
        - listitem [ref=e8]:
          - link "About" [ref=e9]:
            - /url: /about/
        - listitem [ref=e10]:
          - link "Engagements" [ref=e11]:
            - /url: /engagements/
        - listitem [ref=e12]:
          - link "Services" [ref=e13]:
            - /url: /services/
        - listitem [ref=e14]:
          - link "Praxis" [ref=e15]:
            - /url: /praxis/
        - listitem [ref=e16]:
          - link "Contact" [ref=e17]:
            - /url: /contact/
  - main [ref=e19]:
    - region "Engagements" [ref=e20]:
      - generic [ref=e21]:
        - paragraph [ref=e22]: What We Have Done
        - heading "Engagements" [level=1] [ref=e23]
        - paragraph [ref=e24]: Six engagements across six sectors.
      - generic [ref=e26]:
        - generic [ref=e27]: Engagement 1 of 6
        - navigation "Engagement index" [ref=e28]:
          - list [ref=e29]:
            - listitem [ref=e30]:
              - button "Show engagement 001, Civic policy" [ref=e31] [cursor=pointer]:
                - generic [ref=e32]: "001"
            - listitem [ref=e33]:
              - button "Show engagement 002, Land use" [ref=e34] [cursor=pointer]:
                - generic [ref=e35]: "002"
            - listitem [ref=e36]:
              - button "Show engagement 003, Venture capital" [ref=e37] [cursor=pointer]:
                - generic [ref=e38]: "003"
            - listitem [ref=e39]:
              - button "Show engagement 004, Founder strategy" [ref=e40] [cursor=pointer]:
                - generic [ref=e41]: "004"
            - listitem [ref=e42]:
              - button "Show engagement 005, Education" [ref=e43] [cursor=pointer]:
                - generic [ref=e44]: "005"
            - listitem [ref=e45]:
              - button "Show engagement 006, Design" [ref=e46] [cursor=pointer]:
                - generic [ref=e47]: "006"
        - generic [ref=e48]:
          - button "Previous engagement" [disabled] [ref=e49]:
            - img [ref=e50]
          - region "Engagement dossiers, 6 records. Use arrow keys to move between engagements." [ref=e52]:
            - list [ref=e53]:
              - listitem "1 of 6" [ref=e54]:
                - article [ref=e55]:
                  - generic: "001"
                  - paragraph [ref=e57]: Civic policy
                  - heading "Engagement 001 — Policy Infrastructure" [level=2] [ref=e58]
                  - generic [ref=e59]:
                    - generic [ref=e60]: $106M
                    - generic [ref=e61]: Deployment matrix scope
                  - paragraph [ref=e62]: A major metropolitan area faced a systemic crisis with no shortage of proposals but no deployment architecture connecting real funding to validated interventions. We built the bridge between policy intent and fiscal execution.
                  - list [ref=e63]:
                    - listitem [ref=e64]: 9-chapter policy playbook anchored to RCT-validated intervention mathematics
                    - listitem [ref=e65]: $106M deployment matrix mapping 8 funding sources to 17 endpoints
                    - listitem [ref=e66]: Three rounds of adversarial stress-testing — every assumption challenged, every number pressure-tested
                    - listitem [ref=e67]: Three production-grade infographics translating complex fiscal flows into decision-ready visuals
                    - listitem [ref=e68]: Delivered to elected officials in 10 days.
              - listitem [ref=e69]:
                - article [ref=e70]:
                  - generic: "002"
                  - paragraph [ref=e72]: Land use
                  - heading [level=2] [ref=e73]: Engagement 002 — Civic Campaign Arsenal
                  - generic [ref=e74]:
                    - generic [ref=e75]: "87"
                    - generic [ref=e76]: Pages forensically analyzed
                  - paragraph [ref=e77]: A coalition was preparing an appeal against a major land-use decision. Their legal team had reviewed the regulatory record. They missed the critical evidence. We found it — a single-paragraph sustainability finding with zero mention of embodied carbon, adaptive reuse or the jurisdiction's own policy recommendations.
                  - list [ref=e78]:
                    - listitem [ref=e79]: Forensic analysis of an 87-page regulatory decision
                    - listitem [ref=e80]: 7-document campaign arsenal built for a de novo hearing
                    - listitem [ref=e81]: Critical evidentiary gap identified that the coalition's own legal counsel had overlooked
                    - listitem [ref=e82]: Materials deployed to coalition leadership, six municipal officials and an economic development agency.
              - listitem [ref=e83]:
                - article [ref=e84]:
                  - generic: "003"
                  - paragraph [ref=e86]: Venture capital
                  - heading [level=2] [ref=e87]: Engagement 003 — Investor Materials
                  - generic [ref=e88]:
                    - generic [ref=e89]: $4.2B
                    - generic [ref=e90]: Combined addressable market framed
                  - paragraph [ref=e91]: A seed-stage venture needed to present to a 180-partner fund. The existing narrative undersold the competitive position and misstated the addressable market. We rebuilt the story from the data up.
                  - list [ref=e92]:
                    - listitem [ref=e93]: Competitive landscape mapped against six named platforms including a $7.2B incumbent
                    - listitem [ref=e94]: $2.5M use of proceeds modeled across five allocation categories with 18-month milestone projections
                    - listitem [ref=e95]: Market sizing reframed from generic TAM to a $4.2B combined addressable market with sector-specific entry wedges
                    - listitem [ref=e96]: 7 rounds of forensic audit against canonical data sources
                    - listitem [ref=e97]: Submitted through institutional portal. Zero factual errors in the final version.
              - listitem [ref=e98]:
                - article [ref=e99]:
                  - generic: "004"
                  - paragraph [ref=e101]: Founder strategy
                  - heading [level=2] [ref=e102]: Engagement 004 — Business Transformation Architecture
                  - generic [ref=e103]:
                    - generic [ref=e104]: $73.7B
                    - generic [ref=e105]: Market entered with full architecture
                  - paragraph [ref=e106]: A solo founder was entering a $73.7B market with conviction but no strategic infrastructure. Every decision was load-bearing and none of them were documented. We built an 8-document system where every artifact reinforces every other.
                  - list [ref=e107]:
                    - listitem [ref=e108]: Strategic blueprint with 5 core design principles and a 3-tier pricing architecture
                    - listitem [ref=e109]: Comprehensive competitor and market landscape across 4 competitor categories
                    - listitem [ref=e110]: 18-month tactical playbook with week-by-week execution specificity
                    - listitem [ref=e111]: 3-year financial projection modeling conservative, base and aggressive scenarios ($228K to $1.18M revenue trajectory)
                    - listitem [ref=e112]: Metrics dashboard with 3-tier measurement system and pre-built scenario response protocols
                    - listitem [ref=e113]: Risk management framework covering 11 identified threats across 3 priority tiers
                    - listitem [ref=e114]: Every document cross-references every other document in a self-navigating strategic system.
              - listitem [ref=e115]:
                - article [ref=e116]:
                  - generic: "005"
                  - paragraph [ref=e118]: Education
                  - heading [level=2] [ref=e119]: Engagement 005 — Institutional Turnaround Strategy
                  - generic [ref=e120]:
                    - generic [ref=e121]: $243K–$473K
                    - generic [ref=e122]: Annual hidden costs quantified
                  - paragraph [ref=e123]: A K-8 institution was facing enrollment crisis. Geographic perception had calcified into a liability. Operational costs were bleeding in places no one had quantified. We rebuilt the strategic narrative and the financial architecture underneath it.
                  - list [ref=e124]:
                    - listitem [ref=e125]: Narrative repositioning reframing a geographic liability into a strategic asset
                    - listitem [ref=e126]: Financial architecture with enrollment-linked revenue modeling
                    - listitem [ref=e127]: Three-channel recovery strategy with conversion funnel optimization
                    - listitem [ref=e128]: Strategic partnership framework for institutional alliances
                    - listitem [ref=e129]: Operational excellence analysis quantifying $243K–$473K in annual hidden costs with vendor-specific recommendations and 2.2x–4.8x projected ROI
                    - listitem [ref=e130]: Capacity-constrained implementation roadmap
                    - listitem [ref=e131]: Systematic information requirements audit across three priority tiers
                    - listitem [ref=e132]: 7-module architecture. Every module designed to function independently and compound collectively.
              - listitem [ref=e133]:
                - article [ref=e134]:
                  - generic: "006"
                  - paragraph [ref=e136]: Design
                  - heading [level=2] [ref=e137]: Engagement 006 — Digital Platform & Spatial Design
                  - generic [ref=e138]:
                    - generic [ref=e139]: 48hrs
                    - generic [ref=e140]: Concept to production deployment
                  - paragraph [ref=e141]: The brief was a website. What we built was an environment. A six-page immersive platform designed to feel like stepping into a near-future corporate lobby.
                  - list [ref=e142]:
                    - listitem [ref=e143]: Real-time 3D rendering with atmospheric particle systems
                    - listitem [ref=e144]: Spatial depth through layered parallax and WebGL
                    - listitem [ref=e145]: Angular design system with zero border-radius constraint
                    - listitem [ref=e146]: Serverless contact infrastructure
                    - listitem [ref=e147]: View transitions between pages with full responsive architecture
                    - listitem [ref=e148]: Concept to production deployment in under 48hrs.
          - button "Next engagement" [ref=e149] [cursor=pointer]:
            - img [ref=e150]
    - region "Next steps" [ref=e153]:
      - generic [ref=e154]:
        - link "Initiate Contact" [ref=e155]:
          - /url: /contact/
          - generic [ref=e156]: Initiate Contact
        - link "View Services" [ref=e157]:
          - /url: /services/
  - contentinfo [ref=e158]:
    - generic [ref=e159]:
      - paragraph [ref=e160]:
        - generic [ref=e161]: © 2026 Sarif Consulting
        - generic [ref=e162]: ·
        - generic [ref=e163]: Portland, Oregon
      - generic [ref=e164]:
        - navigation "Footer navigation" [ref=e165]:
          - link "Lexicon" [ref=e166]:
            - /url: /lexicon/
          - generic [ref=e167]: ·
          - link "Privacy" [ref=e168]:
            - /url: /privacy/
          - generic [ref=e169]: ·
          - link "Terms" [ref=e170]:
            - /url: /terms/
          - generic [ref=e171]: ·
          - link "Accessibility" [ref=e172]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e173]:
          - button "Open search (Ctrl+K)" [ref=e174] [cursor=pointer]:
            - img [ref=e175]
            - generic [ref=e178]: ⌘K
          - button "Toggle ambient audio" [ref=e179] [cursor=pointer]:
            - generic [ref=e184]: "OFF"
            - generic [ref=e185]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e186]:
      - generic [ref=e187]:
        - paragraph [ref=e188]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e189]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e190] [cursor=pointer]
  - dialog:
    - button
    - document:
      - banner:
        - generic:
          - generic:
            - generic: ❯
            - generic: NAVIGATE · SARIF
          - generic:
            - generic: ⌘
            - generic: K
        - heading [level=2]: Command
        - paragraph:
          - text: Search Praxis, Lexicon, Engagements, and pages. Press
          - generic: /
          - text: anywhere to reopen.
      - generic:
        - img
        - combobox
        - generic: ESC
      - toolbar:
        - button [pressed]:
          - generic: ◆
          - generic: All
        - button:
          - generic: P
          - generic: Praxis
        - button:
          - generic: L
          - generic: Lexicon
        - button:
          - generic: E
          - generic: Engagements
        - button:
          - generic: §
          - generic: Pages
      - contentinfo:
        - generic:
          - generic: ↑
          - generic: ↓
          - generic: navigate
        - generic:
          - generic: ⏎
          - generic: open
        - generic:
          - generic: ⌘
          - generic: ⏎
          - generic: new tab
        - generic:
          - generic: tab
          - generic: scope
        - generic:
          - generic: esc
          - generic: close
  - status
```