/**
 * Agent: Content Strategist / Copywriter
 * Phase: Design / Development
 * Role: Plans and creates the written content that lives within the application.
 */

const ContentStrategist = {
  id: "content-strategist",
  name: "Content Strategist / Copywriter",
  role: "Plans and creates the written content that lives within the application.",
  phase: "design",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "cs-001",
      title: "Write UI copy (buttons, labels, error messages, onboarding flows)",
      description:
        "Craft all in-app microcopy: button labels, form field placeholders, error/success messages, empty states, loading states, tooltips, and onboarding walkthrough text.",
      estimatedHours: 12,
      dependencies: ["ux-002", "ux-003"],
      deliverables: ["content/ui-copy.md"],
    },
    {
      id: "cs-002",
      title: "Develop brand voice and tone guidelines",
      description:
        "Define the golf app's voice: friendly, knowledgeable, encouraging. Create tone variations for different contexts (booking confirmation vs error vs celebration).",
      estimatedHours: 6,
      dependencies: ["po-001"],
      deliverables: ["content/voice-and-tone.md"],
    },
    {
      id: "cs-003",
      title: "Create landing page and marketing copy",
      description:
        "Write hero section, feature highlights, testimonials section, CTA copy, and FAQ content for the public-facing landing page.",
      estimatedHours: 8,
      dependencies: ["cs-002", "po-004"],
      deliverables: ["content/landing-page-copy.md"],
    },
    {
      id: "cs-004",
      title: "Plan content structure and taxonomy",
      description:
        "Define content types (course descriptions, blog posts, tips, news), tagging systems, and content hierarchy for the golf platform.",
      estimatedHours: 6,
      dependencies: ["ux-005", "seo-001"],
      deliverables: ["content/content-model.md", "content/taxonomy.md"],
    },
    {
      id: "cs-005",
      title: "Conduct content audits and A/B testing on messaging",
      description:
        "Review all content for consistency, clarity, and effectiveness. Set up A/B tests for key CTAs (booking button text, sign-up prompts).",
      estimatedHours: 6,
      dependencies: ["cs-001", "cs-003"],
      deliverables: ["content/audit-report.md", "content/ab-test-plan.md"],
    },
  ],

  canRunParallelWith: ["ux-designer", "ui-designer", "frontend-developer", "seo-specialist"],
};

module.exports = ContentStrategist;
