/**
 * Agent: Technical Lead / Architect
 * Phase: Planning / All
 * Role: Sets the technical direction and makes high-level design decisions.
 */

const TechnicalLead = {
  id: "technical-lead",
  name: "Technical Lead / Architect",
  role: "Sets the technical direction and makes high-level design decisions.",
  phase: "planning",
  parallel: true,
  priority: 1,

  subTasks: [
    {
      id: "tl-001",
      title: "Choose the tech stack and frameworks",
      description:
        "Evaluate and select: React/Next.js for frontend, Node.js/Express for backend, PostgreSQL for database, Redis for caching, AWS for hosting. Document rationale.",
      estimatedHours: 8,
      dependencies: ["po-001"],
      deliverables: ["tech-stack-decision.md"],
    },
    {
      id: "tl-002",
      title: "Design system architecture and service boundaries",
      description:
        "Define the overall architecture: monolith vs microservices, API gateway pattern, WebSocket service for live scoring, CDN strategy, and service communication patterns.",
      estimatedHours: 12,
      dependencies: ["tl-001", "po-002"],
      deliverables: ["system-architecture.md", "service-boundaries.md"],
    },
    {
      id: "tl-003",
      title: "Establish coding standards and review processes",
      description:
        "Define ESLint/Prettier configs, Git branching strategy, PR review requirements, commit message conventions, and documentation standards.",
      estimatedHours: 4,
      dependencies: ["tl-001"],
      deliverables: [".eslintrc.js", ".prettierrc", "contributing.md"],
    },
    {
      id: "tl-004",
      title: "Mentor developers and resolve technical disputes",
      description:
        "Conduct architecture review sessions, pair programming for complex features, and mediate technical decisions between frontend and backend teams.",
      estimatedHours: 6,
      recurring: true,
      frequency: "weekly",
      dependencies: ["tl-002"],
      deliverables: ["architecture-review-notes.md"],
    },
    {
      id: "tl-005",
      title: "Evaluate build-vs-buy decisions",
      description:
        "Assess: build custom booking engine vs integrate existing, custom payment flow vs Stripe Checkout, custom auth vs Auth0, custom analytics vs third-party.",
      estimatedHours: 6,
      dependencies: ["po-001", "tl-001"],
      deliverables: ["build-vs-buy-analysis.md"],
    },
  ],

  canRunParallelWith: ["project-manager", "product-manager"],
};

module.exports = TechnicalLead;
