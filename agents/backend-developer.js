/**
 * Agent: Backend Developer
 * Phase: Development
 * Role: Builds the server-side logic, APIs, and data layer that power the application.
 */

const BackendDeveloper = {
  id: "backend-developer",
  name: "Backend Developer",
  role: "Builds the server-side logic, APIs, and data layer that power the application.",
  phase: "development",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "be-001",
      title: "Design and build RESTful APIs",
      description:
        "Create REST API endpoints: /api/courses, /api/bookings, /api/scores, /api/users, /api/proshop, /api/leaderboards with proper versioning.",
      estimatedHours: 24,
      dependencies: ["db-001", "tl-001"],
      deliverables: ["src/server/routes/", "api-documentation.md"],
    },
    {
      id: "be-002",
      title: "Write business logic and server-side validation",
      description:
        "Implement booking conflict resolution, handicap calculations, tee-time availability logic, scoring validation, and pro shop inventory management.",
      estimatedHours: 20,
      dependencies: ["be-001", "po-002"],
      deliverables: ["src/server/services/", "src/server/validators/"],
    },
    {
      id: "be-003",
      title: "Implement authentication and authorization",
      description:
        "Build JWT-based auth with roles: golfer, course-admin, pro-shop-manager, system-admin. Implement OAuth for social login.",
      estimatedHours: 12,
      dependencies: ["be-001", "db-001"],
      deliverables: ["src/server/auth/"],
    },
    {
      id: "be-004",
      title: "Integrate third-party services and payment gateways",
      description:
        "Integrate Stripe for tee-time payments and pro shop purchases, SendGrid for email notifications, weather API for course conditions.",
      estimatedHours: 16,
      dependencies: ["be-002", "be-003"],
      deliverables: ["src/server/integrations/"],
    },
    {
      id: "be-005",
      title: "Optimize database queries and caching strategies",
      description:
        "Implement Redis caching for course listings and leaderboards. Optimize N+1 queries, add indexes, implement connection pooling.",
      estimatedHours: 10,
      dependencies: ["be-001", "be-002", "db-002"],
      deliverables: ["caching-strategy.md"],
    },
  ],

  canRunParallelWith: ["frontend-developer", "database-admin", "devops-engineer"],
};

module.exports = BackendDeveloper;
