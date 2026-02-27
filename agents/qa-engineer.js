/**
 * Agent: QA Engineer / Tester
 * Phase: Testing
 * Role: Ensures the application meets quality standards before release.
 */

const QAEngineer = {
  id: "qa-engineer",
  name: "QA Engineer / Tester",
  role: "Ensures the application meets quality standards before release.",
  phase: "testing",
  parallel: true,
  priority: 4,

  subTasks: [
    {
      id: "qa-001",
      title: "Write and execute test plans and test cases",
      description:
        "Create comprehensive test plans covering all golf app features: booking flows, scorecard entry, leaderboards, pro shop checkout, user management.",
      estimatedHours: 12,
      dependencies: ["po-002", "fe-001", "be-001"],
      deliverables: ["tests/test-plans/", "tests/test-cases/"],
    },
    {
      id: "qa-002",
      title: "Perform manual exploratory testing",
      description:
        "Conduct exploratory testing sessions focusing on edge cases: simultaneous bookings, scorecard corrections, payment failures, session timeouts.",
      estimatedHours: 10,
      dependencies: ["fs-002", "fs-003", "fs-004"],
      deliverables: ["tests/exploratory-notes.md"],
    },
    {
      id: "qa-003",
      title: "Build automated test suites (Playwright)",
      description:
        "Create end-to-end automated tests with Playwright for critical user paths: sign up, book tee time, play round, view leaderboard, purchase from pro shop.",
      estimatedHours: 20,
      dependencies: ["fe-003", "be-001"],
      deliverables: ["tests/e2e/"],
    },
    {
      id: "qa-004",
      title: "Conduct regression, performance, and load testing",
      description:
        "Run regression suite before each release. Perform load testing simulating 500+ concurrent users during peak Saturday morning tee-time booking.",
      estimatedHours: 10,
      dependencies: ["qa-003", "devops-003"],
      deliverables: ["tests/load-tests/", "tests/performance-report.md"],
    },
    {
      id: "qa-005",
      title: "File and track bug reports",
      description:
        "Document bugs with reproduction steps, expected vs actual behavior, severity, and screenshots. Track resolution through to verification.",
      estimatedHours: 4,
      recurring: true,
      frequency: "ongoing",
      dependencies: ["qa-001"],
      deliverables: ["tests/bug-reports/"],
    },
  ],

  canRunParallelWith: ["security-engineer", "data-analyst", "seo-specialist"],
};

module.exports = QAEngineer;
