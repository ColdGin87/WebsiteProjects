/**
 * Agent: Product Manager / Product Owner
 * Phase: Planning
 * Role: Defines the product vision, prioritizes features, and ensures the team builds the right thing for users.
 */

const ProductManager = {
  id: "product-manager",
  name: "Product Manager / Product Owner",
  role: "Defines the product vision, prioritizes features, and ensures the team builds the right thing for users.",
  phase: "planning",
  priority: 1,

  subTasks: [
    {
      id: "po-001",
      title: "Gather and document requirements",
      description:
        "Interview stakeholders to capture functional and non-functional requirements for the golf website (course listings, tee-time booking, scorecards, social features, pro shop).",
      estimatedHours: 10,
      dependencies: [],
      deliverables: ["requirements-document.md"],
    },
    {
      id: "po-002",
      title: "Write user stories and acceptance criteria",
      description:
        "Translate requirements into user stories: As a [golfer/admin/pro], I want to [action] so that [benefit].",
      estimatedHours: 12,
      dependencies: ["po-001"],
      deliverables: ["user-stories.md"],
    },
    {
      id: "po-003",
      title: "Maintain and prioritize the product backlog",
      description:
        "Rank user stories by business value and effort using MoSCoW prioritization. Groom the backlog weekly.",
      estimatedHours: 4,
      recurring: true,
      frequency: "weekly",
      dependencies: ["po-002"],
      deliverables: ["product-backlog.md"],
    },
    {
      id: "po-004",
      title: "Conduct user research and competitor analysis",
      description:
        "Analyze competing golf apps (GolfNow, TeeOff, 18Birdies, Golfshot) and survey target users.",
      estimatedHours: 8,
      dependencies: [],
      deliverables: ["competitor-analysis.md", "user-research-findings.md"],
    },
    {
      id: "po-005",
      title: "Define success metrics and KPIs",
      description:
        "Establish measurable KPIs: user sign-ups, booking conversion rate, session duration, NPS score, revenue per user.",
      estimatedHours: 4,
      dependencies: ["po-001", "po-004"],
      deliverables: ["kpis-and-metrics.md"],
    },
  ],

  canRunParallelWith: ["project-manager", "ux-designer", "technical-lead", "seo-specialist"],
};

module.exports = ProductManager;
