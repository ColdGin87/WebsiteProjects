/**
 * Agent: DevOps / Site Reliability Engineer (SRE)
 * Phase: Development / Deployment
 * Role: Manages infrastructure, deployments, and system reliability.
 */

const DevOpsEngineer = {
  id: "devops-engineer",
  name: "DevOps / Site Reliability Engineer (SRE)",
  role: "Manages infrastructure, deployments, and system reliability.",
  phase: "development",
  parallel: true,
  priority: 2,

  subTasks: [
    {
      id: "devops-001",
      title: "Set up CI/CD pipelines",
      description:
        "Configure GitHub Actions pipelines: lint, test, build, deploy to staging on PR merge, deploy to production on release tag.",
      estimatedHours: 10,
      dependencies: ["tl-001"],
      deliverables: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
    },
    {
      id: "devops-002",
      title: "Configure cloud infrastructure",
      description:
        "Provision AWS infrastructure: EC2/ECS for app servers, RDS for PostgreSQL, ElastiCache for Redis, S3 for static assets, CloudFront CDN, Route 53 for DNS.",
      estimatedHours: 14,
      dependencies: ["tl-001", "tl-002"],
      deliverables: ["infrastructure/", "infrastructure/terraform/"],
    },
    {
      id: "devops-003",
      title: "Manage containerization and orchestration",
      description:
        "Create Docker images for frontend and backend services. Set up Docker Compose for local dev and ECS task definitions for production.",
      estimatedHours: 8,
      dependencies: ["devops-002"],
      deliverables: ["Dockerfile", "docker-compose.yml", "infrastructure/ecs/"],
    },
    {
      id: "devops-004",
      title: "Implement monitoring, alerting, and logging",
      description:
        "Set up CloudWatch dashboards, PagerDuty alerting for uptime/error-rate thresholds, centralized logging, and APM integration.",
      estimatedHours: 10,
      dependencies: ["devops-002", "devops-003"],
      deliverables: ["monitoring/dashboards.md", "monitoring/alerting-rules.md"],
    },
    {
      id: "devops-005",
      title: "Handle incident response and post-mortems",
      description:
        "Create incident response playbook, define severity levels, set up on-call rotation template, and establish post-mortem process.",
      estimatedHours: 4,
      dependencies: ["devops-004"],
      deliverables: ["incident-response-playbook.md", "post-mortem-template.md"],
    },
  ],

  canRunParallelWith: ["backend-developer", "database-admin", "security-engineer"],
};

module.exports = DevOpsEngineer;
