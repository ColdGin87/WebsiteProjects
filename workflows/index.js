/**
 * Workflow Definitions
 *
 * Defines the five project phases and which agents operate as
 * parallel groups vs sequential gates within each phase.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PHASE 1: PLANNING                                                 │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL: Project Manager, Product Manager, Tech Lead   │       │
 * │  └─────────────────────────────────────────────────────────┘       │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  PHASE 2: DESIGN                                                   │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL: UX Designer, UI Designer, Content Strategist  │       │
 * │  └─────────────────────────────────────────────────────────┘       │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  PHASE 3: DEVELOPMENT                                              │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL GROUP A: Database Admin, DevOps Engineer       │       │
 * │  └───────────────────────┬─────────────────────────────────┘       │
 * │                          ▼                                         │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL GROUP B: Frontend Dev, Backend Dev, Full-Stack │       │
 * │  └───────────────────────┬─────────────────────────────────┘       │
 * │                          ▼                                         │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL GROUP C: SEO Specialist, Data Analyst          │       │
 * │  └─────────────────────────────────────────────────────────┘       │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  PHASE 4: TESTING                                                  │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ PARALLEL: QA Engineer, Security Engineer                │       │
 * │  └─────────────────────────────────────────────────────────┘       │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  PHASE 5: DEPLOYMENT                                               │
 * │  ┌─────────────────────────────────────────────────────────┐       │
 * │  │ SEQUENTIAL: DevOps → Project Manager sign-off           │       │
 * │  └─────────────────────────────────────────────────────────┘       │
 * └─────────────────────────────────────────────────────────────────────┘
 */

const phaseWorkflows = {
  planning: {
    name: "Planning",
    description: "Define vision, requirements, tech stack, and project plan.",
    parallelGroups: [
      {
        name: "Core Planning Team",
        agents: ["project-manager", "product-manager", "technical-lead"],
        execution: "parallel",
        gateCondition: "All planning sub-tasks completed before moving to Design.",
      },
    ],
  },

  design: {
    name: "Design",
    description: "Research users, design UX/UI, create content strategy.",
    parallelGroups: [
      {
        name: "Design & Content Team",
        agents: ["ux-designer", "ui-designer", "content-strategist"],
        execution: "parallel",
        gateCondition: "Wireframes, mockups, and content plan approved before Development.",
      },
    ],
  },

  development: {
    name: "Development",
    description: "Build the application across all layers of the stack.",
    parallelGroups: [
      {
        name: "Infrastructure Layer",
        agents: ["database-admin", "devops-engineer"],
        execution: "parallel",
        gateCondition: "Database schema and CI/CD pipeline ready before app development.",
      },
      {
        name: "Application Layer",
        agents: ["frontend-developer", "backend-developer", "fullstack-developer"],
        execution: "parallel",
        gateCondition: "Core features implemented and API contracts fulfilled.",
      },
      {
        name: "Optimization Layer",
        agents: ["seo-specialist", "data-analyst"],
        execution: "parallel",
        gateCondition: "SEO and analytics integrated before testing phase.",
      },
    ],
  },

  testing: {
    name: "Testing",
    description: "Validate quality, security, and performance.",
    parallelGroups: [
      {
        name: "Quality & Security Team",
        agents: ["qa-engineer", "security-engineer"],
        execution: "parallel",
        gateCondition: "All critical/high bugs fixed, security audit passed before Deployment.",
      },
    ],
  },

  deployment: {
    name: "Deployment",
    description: "Ship to production and hand off to operations.",
    parallelGroups: [
      {
        name: "Release Team",
        agents: ["devops-engineer", "project-manager"],
        execution: "sequential",
        gateCondition: "Production deployment verified, stakeholders notified.",
      },
    ],
  },
};

module.exports = phaseWorkflows;
