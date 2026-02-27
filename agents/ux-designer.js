/**
 * Agent: UX Designer
 * Phase: Design
 * Role: Researches user needs and designs intuitive, accessible user experiences.
 */

const UXDesigner = {
  id: "ux-designer",
  name: "UX Designer",
  role: "Researches user needs and designs intuitive, accessible user experiences.",
  phase: "design",
  priority: 2,

  subTasks: [
    {
      id: "ux-001",
      title: "Conduct user interviews and usability testing",
      description:
        "Interview 10-15 golfers across skill levels to understand booking habits, scorecard preferences, and pain points with existing golf apps.",
      estimatedHours: 12,
      dependencies: ["po-001"],
      deliverables: ["user-interview-notes.md", "usability-report.md"],
    },
    {
      id: "ux-002",
      title: "Create user flows and journey maps",
      description:
        "Map key journeys: new user onboarding, booking a tee time, recording a round, viewing leaderboards, purchasing from pro shop.",
      estimatedHours: 8,
      dependencies: ["ux-001", "po-002"],
      deliverables: ["user-flows.md", "journey-maps.md"],
    },
    {
      id: "ux-003",
      title: "Build wireframes",
      description:
        "Create low-fidelity wireframes for all primary screens: home, course finder, booking flow, scorecard, profile, pro shop.",
      estimatedHours: 16,
      dependencies: ["ux-002"],
      deliverables: ["wireframes/"],
    },
    {
      id: "ux-004",
      title: "Build interactive prototypes",
      description:
        "Create clickable prototypes for the core booking and scorecard flows to validate with users.",
      estimatedHours: 10,
      dependencies: ["ux-003"],
      deliverables: ["prototypes/"],
    },
    {
      id: "ux-005",
      title: "Develop information architecture",
      description:
        "Define site map, navigation hierarchy, and content organization for the golf platform.",
      estimatedHours: 6,
      dependencies: ["po-002", "ux-001"],
      deliverables: ["information-architecture.md", "sitemap.md"],
    },
    {
      id: "ux-006",
      title: "Define accessibility standards",
      description:
        "Establish WCAG 2.1 AA compliance requirements, color contrast ratios, screen reader support, and keyboard navigation patterns.",
      estimatedHours: 4,
      dependencies: [],
      deliverables: ["accessibility-standards.md"],
    },
  ],

  canRunParallelWith: ["product-manager", "content-strategist", "seo-specialist"],
};

module.exports = UXDesigner;
