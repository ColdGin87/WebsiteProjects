/**
 * Agent: SEO Specialist
 * Phase: Design / Development / Deployment
 * Role: Optimizes the application for search engine visibility.
 */

const SEOSpecialist = {
  id: "seo-specialist",
  name: "SEO Specialist",
  role: "Optimizes the application for search engine visibility.",
  phase: "development",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "seo-001",
      title: "Conduct keyword research",
      description:
        "Research and prioritize keywords: 'book tee time online', 'golf courses near me', 'golf scorecard app', 'golf handicap tracker', and long-tail variations.",
      estimatedHours: 8,
      dependencies: ["po-004"],
      deliverables: ["seo/keyword-research.md"],
    },
    {
      id: "seo-002",
      title: "Optimize meta tags, structured data, and page speed",
      description:
        "Implement title tags, meta descriptions, Open Graph tags, JSON-LD structured data for courses and events, and Core Web Vitals optimizations.",
      estimatedHours: 10,
      dependencies: ["seo-001", "fe-001", "tl-001"],
      deliverables: ["seo/meta-tag-specs.md", "seo/structured-data-schemas.md"],
    },
    {
      id: "seo-003",
      title: "Audit site architecture for crawlability",
      description:
        "Ensure proper URL structure, XML sitemap generation, robots.txt configuration, canonical tags, and server-side rendering for critical pages.",
      estimatedHours: 6,
      dependencies: ["ux-005", "fe-002"],
      deliverables: ["seo/crawlability-audit.md", "public/robots.txt", "public/sitemap.xml"],
    },
    {
      id: "seo-004",
      title: "Build internal linking strategies",
      description:
        "Design internal link architecture: course pages linking to booking, scorecard pages linking to leaderboards, blog content linking to features.",
      estimatedHours: 4,
      dependencies: ["seo-003", "cs-004"],
      deliverables: ["seo/internal-linking-plan.md"],
    },
    {
      id: "seo-005",
      title: "Monitor rankings and organic traffic analytics",
      description:
        "Set up Google Search Console, configure rank tracking tools, build SEO dashboard, and establish monthly reporting cadence.",
      estimatedHours: 4,
      dependencies: ["seo-002", "da-001"],
      deliverables: ["seo/monitoring-setup.md", "seo/reporting-template.md"],
    },
  ],

  canRunParallelWith: ["frontend-developer", "content-strategist", "data-analyst"],
};

module.exports = SEOSpecialist;
