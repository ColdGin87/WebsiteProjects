/**
 * Phase 1: Planning — Task Breakdown
 *
 * Agents active: Project Manager, Product Manager, Technical Lead
 * Execution: All three run in PARALLEL
 *
 * Dependency chain within this phase:
 *
 *   Wave 1 (no dependencies — kick off immediately in parallel):
 *     ├── pm-001  Create project plan and timeline          [Project Manager]
 *     ├── po-001  Gather and document requirements          [Product Manager]
 *     ├── po-004  Conduct user research & competitor analysis [Product Manager]
 *     └── tl-001  Choose the tech stack and frameworks      [Technical Lead]
 *
 *   Wave 2 (depends on Wave 1 outputs):
 *     ├── pm-003  Manage stakeholder communication          [PM] ← pm-001
 *     ├── po-002  Write user stories & acceptance criteria  [PO] ← po-001
 *     ├── po-005  Define success metrics and KPIs           [PO] ← po-001, po-004
 *     ├── tl-003  Establish coding standards                [TL] ← tl-001
 *     └── tl-005  Evaluate build-vs-buy decisions           [TL] ← po-001, tl-001
 *
 *   Wave 3:
 *     ├── pm-002  Run sprint planning sessions              [PM] ← pm-001, po-002
 *     ├── po-003  Maintain & prioritize product backlog     [PO] ← po-002
 *     └── tl-002  Design system architecture                [TL] ← tl-001, po-002
 *
 *   Wave 4:
 *     ├── pm-004  Track milestones and resolve blockers     [PM] ← pm-002
 *     └── tl-004  Mentor developers & resolve disputes      [TL] ← tl-002
 *
 *   Wave 5:
 *     └── pm-005  Write status reports                      [PM] ← pm-004
 */

module.exports = {
  phase: "planning",
  waves: [
    {
      wave: 1,
      execution: "parallel",
      tasks: ["pm-001", "po-001", "po-004", "tl-001"],
      description: "Kick-off: project plan, requirements gathering, tech stack selection.",
    },
    {
      wave: 2,
      execution: "parallel",
      tasks: ["pm-003", "po-002", "po-005", "tl-003", "tl-005"],
      description: "User stories, KPIs, coding standards, stakeholder setup.",
    },
    {
      wave: 3,
      execution: "parallel",
      tasks: ["pm-002", "po-003", "tl-002"],
      description: "Sprint planning, backlog prioritization, system architecture.",
    },
    {
      wave: 4,
      execution: "parallel",
      tasks: ["pm-004", "tl-004"],
      description: "Ongoing tracking and mentorship begin.",
    },
    {
      wave: 5,
      execution: "sequential",
      tasks: ["pm-005"],
      description: "First status report compiled.",
    },
  ],
};
