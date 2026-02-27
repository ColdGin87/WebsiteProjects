/**
 * Agent: Security Engineer
 * Phase: Testing / Deployment
 * Role: Identifies and mitigates security vulnerabilities.
 */

const SecurityEngineer = {
  id: "security-engineer",
  name: "Security Engineer",
  role: "Identifies and mitigates security vulnerabilities.",
  phase: "testing",
  parallel: true,
  priority: 4,

  subTasks: [
    {
      id: "sec-001",
      title: "Conduct security audits and penetration testing",
      description:
        "Perform OWASP Top 10 assessment against the golf application: SQL injection, XSS, CSRF, broken auth, sensitive data exposure.",
      estimatedHours: 12,
      dependencies: ["be-001", "fe-003", "be-003"],
      deliverables: ["security/audit-report.md", "security/pentest-findings.md"],
    },
    {
      id: "sec-002",
      title: "Implement encryption, secure headers, and CSRF/XSS protections",
      description:
        "Configure HTTPS/TLS, set Content-Security-Policy, X-Frame-Options, HSTS headers. Implement CSRF tokens, input sanitization, and output encoding.",
      estimatedHours: 8,
      dependencies: ["be-001", "devops-002"],
      deliverables: ["src/server/middleware/security.js", "security/headers-config.md"],
    },
    {
      id: "sec-003",
      title: "Manage secrets and credential rotation",
      description:
        "Set up AWS Secrets Manager for API keys, database credentials, and Stripe keys. Implement rotation policies and ensure no secrets in source code.",
      estimatedHours: 6,
      dependencies: ["devops-002", "be-004"],
      deliverables: ["security/secrets-management.md"],
    },
    {
      id: "sec-004",
      title: "Ensure compliance (GDPR, PCI-DSS)",
      description:
        "Implement GDPR consent management, data deletion requests, and privacy policy. Ensure PCI-DSS compliance for payment processing via Stripe.",
      estimatedHours: 10,
      dependencies: ["be-003", "be-004"],
      deliverables: ["security/gdpr-compliance.md", "security/pci-compliance.md"],
    },
    {
      id: "sec-005",
      title: "Perform security-focused code reviews",
      description:
        "Review all authentication, payment, and data-handling code for vulnerabilities. Establish security review checklist for ongoing PRs.",
      estimatedHours: 8,
      recurring: true,
      frequency: "per-sprint",
      dependencies: ["sec-001"],
      deliverables: ["security/review-checklist.md"],
    },
  ],

  canRunParallelWith: ["qa-engineer", "devops-engineer", "database-admin"],
};

module.exports = SecurityEngineer;
