/**
 * Agent: UI Designer
 * Phase: Design
 * Role: Creates the visual design system and polished interface elements.
 */

const UIDesigner = {
  id: "ui-designer",
  name: "UI Designer",
  role: "Creates the visual design system and polished interface elements.",
  phase: "design",
  priority: 2,

  subTasks: [
    {
      id: "ui-001",
      title: "Design high-fidelity mockups and screen layouts",
      description:
        "Create pixel-perfect mockups for all screens: homepage, course directory, tee-time booking, scorecard, user profile, pro shop, admin dashboard.",
      estimatedHours: 24,
      dependencies: ["ux-003", "ux-005"],
      deliverables: ["mockups/"],
    },
    {
      id: "ui-002",
      title: "Build design system with reusable components",
      description:
        "Create a component library: buttons, cards, forms, modals, navigation, scorecard widgets, course cards, booking selectors.",
      estimatedHours: 16,
      dependencies: ["ui-001"],
      deliverables: ["design-system/"],
    },
    {
      id: "ui-003",
      title: "Select typography, color palette, and iconography",
      description:
        "Define brand-aligned visual language: golf-green primary palette, clean sans-serif typography, sport-themed icon set.",
      estimatedHours: 6,
      dependencies: [],
      deliverables: ["brand-guidelines.md", "assets/colors.css", "assets/typography.css"],
    },
    {
      id: "ui-004",
      title: "Create responsive designs for multiple breakpoints",
      description:
        "Design for mobile (375px), tablet (768px), desktop (1280px), and large desktop (1440px+) breakpoints.",
      estimatedHours: 12,
      dependencies: ["ui-001"],
      deliverables: ["responsive-mockups/"],
    },
    {
      id: "ui-005",
      title: "Prepare design specs and asset handoffs",
      description:
        "Export assets (SVGs, PNGs), document spacing/sizing tokens, and prepare handoff specs for frontend developers.",
      estimatedHours: 6,
      dependencies: ["ui-002", "ui-004"],
      deliverables: ["handoff-specs/", "assets/exported/"],
    },
  ],

  canRunParallelWith: ["ux-designer", "content-strategist"],
};

module.exports = UIDesigner;
