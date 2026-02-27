/**
 * Phase 2: Design — Task Breakdown
 *
 * Agents active: UX Designer, UI Designer, Content Strategist
 * Execution: All three run in PARALLEL
 *
 * Dependency chain within this phase:
 *
 *   Wave 1 (no intra-phase dependencies):
 *     ├── ux-001  Conduct user interviews             [UX]  ← po-001 (from Phase 1)
 *     ├── ux-006  Define accessibility standards       [UX]  ← none
 *     ├── ui-003  Select typography/color/icons        [UI]  ← none
 *     └── cs-002  Develop brand voice & tone           [CS]  ← po-001 (from Phase 1)
 *
 *   Wave 2:
 *     ├── ux-002  Create user flows & journey maps     [UX]  ← ux-001, po-002
 *     ├── ux-005  Develop information architecture     [UX]  ← po-002, ux-001
 *     └── cs-001  Write UI copy                        [CS]  ← ux-002, ux-003
 *
 *   Wave 3:
 *     ├── ux-003  Build wireframes                     [UX]  ← ux-002
 *     └── cs-004  Plan content structure & taxonomy    [CS]  ← ux-005, seo-001
 *
 *   Wave 4:
 *     ├── ux-004  Build interactive prototypes         [UX]  ← ux-003
 *     ├── ui-001  Design high-fidelity mockups         [UI]  ← ux-003, ux-005
 *     └── cs-003  Create landing page copy             [CS]  ← cs-002, po-004
 *
 *   Wave 5:
 *     ├── ui-002  Build design system components       [UI]  ← ui-001
 *     ├── ui-004  Responsive designs for breakpoints   [UI]  ← ui-001
 *     └── cs-005  Content audits & A/B test plans      [CS]  ← cs-001, cs-003
 *
 *   Wave 6:
 *     └── ui-005  Prepare design specs & asset handoff [UI]  ← ui-002, ui-004
 */

module.exports = {
  phase: "design",
  waves: [
    {
      wave: 1,
      execution: "parallel",
      tasks: ["ux-001", "ux-006", "ui-003", "cs-002"],
      description: "User research, accessibility standards, visual identity, brand voice.",
    },
    {
      wave: 2,
      execution: "parallel",
      tasks: ["ux-002", "ux-005"],
      description: "User flows, journey maps, information architecture.",
    },
    {
      wave: 3,
      execution: "parallel",
      tasks: ["ux-003", "cs-001", "cs-004"],
      description: "Wireframes, UI copy, content taxonomy.",
    },
    {
      wave: 4,
      execution: "parallel",
      tasks: ["ux-004", "ui-001", "cs-003"],
      description: "Prototypes, high-fidelity mockups, landing page copy.",
    },
    {
      wave: 5,
      execution: "parallel",
      tasks: ["ui-002", "ui-004", "cs-005"],
      description: "Design system, responsive layouts, content audits.",
    },
    {
      wave: 6,
      execution: "sequential",
      tasks: ["ui-005"],
      description: "Final design spec handoff to developers.",
    },
  ],
};
