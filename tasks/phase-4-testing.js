/**
 * Phase 4: Testing — Task Breakdown
 *
 * Agents active: QA Engineer, Security Engineer
 * Execution: Both run in PARALLEL
 *
 *   Wave 1 (parallel):
 *     ├── qa-001   Write test plans & test cases           [QA]   ← po-002, fe-001, be-001
 *     └── sec-001  Security audit & penetration testing    [Sec]  ← be-001, fe-003, be-003
 *
 *   Wave 2 (parallel):
 *     ├── qa-003   Build automated E2E tests (Playwright)  [QA]   ← fe-003, be-001
 *     ├── qa-005   File & track bug reports                [QA]   ← qa-001
 *     ├── sec-002  Secure headers, CSRF/XSS protections    [Sec]  ← be-001, devops-002
 *     ├── sec-003  Secrets management & rotation           [Sec]  ← devops-002, be-004
 *     └── sec-004  GDPR & PCI-DSS compliance               [Sec]  ← be-003, be-004
 *
 *   Wave 3 (parallel):
 *     ├── qa-002   Manual exploratory testing              [QA]   ← fs-002, fs-003, fs-004
 *     ├── qa-004   Regression, performance, load testing   [QA]   ← qa-003, devops-003
 *     └── sec-005  Security-focused code reviews           [Sec]  ← sec-001
 */

module.exports = {
  phase: "testing",
  waves: [
    {
      wave: 1,
      execution: "parallel",
      tasks: ["qa-001", "sec-001"],
      description: "Test plans and security audit kick off simultaneously.",
    },
    {
      wave: 2,
      execution: "parallel",
      tasks: ["qa-003", "qa-005", "sec-002", "sec-003", "sec-004"],
      description: "Automated tests, bug tracking, security hardening, compliance checks.",
    },
    {
      wave: 3,
      execution: "parallel",
      tasks: ["qa-002", "qa-004", "sec-005"],
      description: "Exploratory testing, load testing, security code reviews.",
    },
  ],
};
