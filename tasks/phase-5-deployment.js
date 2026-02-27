/**
 * Phase 5: Deployment — Task Breakdown
 *
 * Agents active: DevOps Engineer (primary), Project Manager (sign-off)
 * Execution: SEQUENTIAL — deploy then verify then communicate
 *
 * This phase reuses tasks from DevOps and Project Manager agents
 * that are relevant to go-live. Additional deployment-specific
 * activities are defined here.
 *
 *   Step 1: Pre-deployment checklist
 *     └── Verify all Phase 4 gate conditions are met (QA + Security sign-off)
 *
 *   Step 2: Staging deployment
 *     └── devops-003 tasks completed — containers built and pushed
 *
 *   Step 3: Production deployment
 *     └── Deploy via CI/CD pipeline (devops-001 configured in Phase 3)
 *
 *   Step 4: Post-deployment verification
 *     └── Smoke tests, monitoring dashboards (devops-004), health checks
 *
 *   Step 5: Stakeholder communication & handoff
 *     └── pm-005 final status report, pm-003 stakeholder notification
 */

module.exports = {
  phase: "deployment",
  waves: [
    {
      wave: 1,
      execution: "sequential",
      tasks: ["deployment-checklist"],
      description: "Verify all testing gates passed. QA and Security sign-off confirmed.",
      custom: true,
      steps: [
        "Confirm qa-004 (regression/load tests) passed",
        "Confirm sec-001 (security audit) passed with no critical findings",
        "Confirm sec-004 (compliance) requirements met",
        "Review and approve final release candidate",
      ],
    },
    {
      wave: 2,
      execution: "sequential",
      tasks: ["staging-deploy"],
      description: "Deploy release candidate to staging environment.",
      custom: true,
      steps: [
        "Build production Docker images",
        "Deploy to staging ECS cluster",
        "Run automated smoke tests against staging",
        "Perform manual spot-check of critical flows",
      ],
    },
    {
      wave: 3,
      execution: "sequential",
      tasks: ["production-deploy"],
      description: "Deploy to production with blue-green strategy.",
      custom: true,
      steps: [
        "Deploy to production ECS cluster (blue-green)",
        "Shift traffic gradually (10% → 50% → 100%)",
        "Monitor error rates and latency during rollout",
        "Rollback if error rate exceeds threshold",
      ],
    },
    {
      wave: 4,
      execution: "parallel",
      tasks: ["post-deploy-verify"],
      description: "Post-deployment verification and monitoring.",
      custom: true,
      steps: [
        "Verify all CloudWatch dashboards are green",
        "Run full E2E test suite against production",
        "Confirm analytics events flowing correctly",
        "Check SEO: robots.txt, sitemap, structured data live",
      ],
    },
    {
      wave: 5,
      execution: "sequential",
      tasks: ["stakeholder-handoff"],
      description: "Final status report, stakeholder notification, retrospective scheduled.",
      custom: true,
      steps: [
        "Compile final project status report (pm-005)",
        "Send launch notification to all stakeholders (pm-003)",
        "Schedule project retrospective",
        "Transition to operational support (devops-005 incident playbook)",
      ],
    },
  ],
};
