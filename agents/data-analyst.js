/**
 * Agent: Data Analyst / Analytics Engineer
 * Phase: Development / Deployment
 * Role: Tracks user behavior and measures product performance.
 */

const DataAnalyst = {
  id: "data-analyst",
  name: "Data Analyst / Analytics Engineer",
  role: "Tracks user behavior and measures product performance.",
  phase: "development",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "da-001",
      title: "Implement analytics and event tracking",
      description:
        "Set up Google Analytics 4 and custom event tracking: page views, tee-time searches, booking starts/completions, scorecard entries, pro shop interactions.",
      estimatedHours: 10,
      dependencies: ["fe-001", "po-005"],
      deliverables: ["analytics/tracking-plan.md", "src/analytics/"],
    },
    {
      id: "da-002",
      title: "Build dashboards and reports",
      description:
        "Create dashboards showing: daily active users, booking volume, revenue, popular courses, peak usage times, and user retention cohorts.",
      estimatedHours: 8,
      dependencies: ["da-001"],
      deliverables: ["analytics/dashboard-specs.md"],
    },
    {
      id: "da-003",
      title: "Analyze user funnels and conversion rates",
      description:
        "Map and measure conversion funnels: landing > sign-up > first booking, and course browse > tee-time select > checkout > payment complete.",
      estimatedHours: 6,
      dependencies: ["da-001", "da-002"],
      deliverables: ["analytics/funnel-analysis.md"],
    },
    {
      id: "da-004",
      title: "Run A/B test analysis",
      description:
        "Analyze results from A/B tests on booking flow, pricing display, CTA variations, and onboarding sequences. Provide statistical significance calculations.",
      estimatedHours: 6,
      dependencies: ["da-001", "cs-005"],
      deliverables: ["analytics/ab-test-results.md"],
    },
    {
      id: "da-005",
      title: "Provide data-driven recommendations",
      description:
        "Synthesize analytics findings into actionable recommendations for product, design, and engineering teams to improve KPIs.",
      estimatedHours: 4,
      dependencies: ["da-003", "da-004"],
      deliverables: ["analytics/recommendations.md"],
    },
  ],

  canRunParallelWith: ["seo-specialist", "qa-engineer", "frontend-developer"],
};

module.exports = DataAnalyst;
