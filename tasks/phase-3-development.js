/**
 * Phase 3: Development — Task Breakdown
 *
 * Agents active (3 parallel groups):
 *   Group A (Infrastructure):  Database Admin, DevOps Engineer
 *   Group B (Application):     Frontend Dev, Backend Dev, Full-Stack Dev
 *   Group C (Optimization):    SEO Specialist, Data Analyst
 *
 * Groups A starts first; Group B begins once infrastructure foundations are ready;
 * Group C runs alongside Group B once frontend components exist.
 *
 *   Wave 1 — Infrastructure foundations (parallel):
 *     ├── db-001    Design database schemas                [DBA]
 *     ├── devops-001 Set up CI/CD pipelines                [DevOps]
 *     └── devops-002 Configure cloud infrastructure        [DevOps]
 *
 *   Wave 2 — Infrastructure continued + API kickoff (parallel):
 *     ├── db-002    Write & optimize queries               [DBA]     ← db-001
 *     ├── db-004    Set up migrations                      [DBA]     ← db-001
 *     ├── devops-003 Containerization & orchestration      [DevOps]  ← devops-002
 *     ├── be-001    Design & build REST APIs               [BE]      ← db-001, tl-001
 *     └── seo-001   Conduct keyword research               [SEO]     ← po-004
 *
 *   Wave 3 — Core application build (parallel):
 *     ├── fe-001    Build React UI components              [FE]      ← ui-002, ui-005, tl-001
 *     ├── be-002    Business logic & validation            [BE]      ← be-001, po-002
 *     ├── be-003    Authentication & authorization         [BE]      ← be-001, db-001
 *     ├── db-003    Replication, backups, DR               [DBA]     ← db-001, devops-001
 *     ├── devops-004 Monitoring, alerting, logging         [DevOps]  ← devops-002, devops-003
 *     └── da-001    Implement analytics & event tracking   [DA]      ← fe-001, po-005
 *
 *   Wave 4 — Feature integration (parallel):
 *     ├── fe-002    Responsive layouts                     [FE]      ← ui-004, fe-001
 *     ├── fe-003    API integration & state management     [FE]      ← be-001, fe-001
 *     ├── be-004    Third-party services & payments        [BE]      ← be-002, be-003
 *     ├── be-005    Query optimization & caching           [BE]      ← be-001, be-002, db-002
 *     ├── fs-001    Data flow contracts (shared types)     [FS]      ← be-001, fe-003, tl-001
 *     ├── db-005    DB performance monitoring              [DBA]     ← db-002, db-003
 *     ├── seo-002   Meta tags, structured data, speed      [SEO]     ← seo-001, fe-001, tl-001
 *     └── da-002    Build dashboards & reports             [DA]      ← da-001
 *
 *   Wave 5 — End-to-end features (parallel):
 *     ├── fs-002    E2E: Tee-Time Booking                  [FS]      ← fe-001, be-001, be-003
 *     ├── fs-003    E2E: Live Scorecard                    [FS]      ← fe-001, be-001, db-001
 *     ├── fs-004    E2E: User Profile & Social             [FS]      ← fe-001, be-001, be-003
 *     ├── fe-005    Frontend unit & integration tests      [FE]      ← fe-001, fe-003
 *     ├── seo-003   Crawlability audit                     [SEO]     ← ux-005, fe-002
 *     └── da-003    Funnel & conversion analysis           [DA]      ← da-001, da-002
 *
 *   Wave 6 — Optimization & polish (parallel):
 *     ├── fe-004    Performance optimization               [FE]      ← fe-002, fe-003
 *     ├── fs-005    Architecture decisions doc              [FS]      ← tl-001, tl-002
 *     ├── seo-004   Internal linking strategy              [SEO]     ← seo-003, cs-004
 *     ├── seo-005   Rankings & traffic monitoring setup    [SEO]     ← seo-002, da-001
 *     ├── da-004    A/B test analysis                      [DA]      ← da-001, cs-005
 *     ├── da-005    Data-driven recommendations            [DA]      ← da-003, da-004
 *     └── devops-005 Incident response playbook            [DevOps]  ← devops-004
 */

module.exports = {
  phase: "development",
  waves: [
    {
      wave: 1,
      execution: "parallel",
      tasks: ["db-001", "devops-001", "devops-002"],
      description: "Infrastructure foundations: schemas, CI/CD, cloud setup.",
    },
    {
      wave: 2,
      execution: "parallel",
      tasks: ["db-002", "db-004", "devops-003", "be-001", "seo-001"],
      description: "Queries, migrations, containers, API scaffolding, keyword research.",
    },
    {
      wave: 3,
      execution: "parallel",
      tasks: ["fe-001", "be-002", "be-003", "db-003", "devops-004", "da-001"],
      description: "UI components, business logic, auth, backups, monitoring, analytics.",
    },
    {
      wave: 4,
      execution: "parallel",
      tasks: ["fe-002", "fe-003", "be-004", "be-005", "fs-001", "db-005", "seo-002", "da-002"],
      description: "Layouts, API integration, payments, caching, SEO, dashboards.",
    },
    {
      wave: 5,
      execution: "parallel",
      tasks: ["fs-002", "fs-003", "fs-004", "fe-005", "seo-003", "da-003"],
      description: "End-to-end features, tests, crawlability, funnel analysis.",
    },
    {
      wave: 6,
      execution: "parallel",
      tasks: ["fe-004", "fs-005", "seo-004", "seo-005", "da-004", "da-005", "devops-005"],
      description: "Performance optimization, architecture docs, SEO monitoring, incident playbook.",
    },
  ],
};
