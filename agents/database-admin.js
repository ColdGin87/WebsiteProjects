/**
 * Agent: Database Administrator / Data Engineer
 * Phase: Development
 * Role: Designs, maintains, and optimizes the data layer.
 */

const DatabaseAdmin = {
  id: "database-admin",
  name: "Database Administrator / Data Engineer",
  role: "Designs, maintains, and optimizes the data layer.",
  phase: "development",
  parallel: true,
  priority: 2,

  subTasks: [
    {
      id: "db-001",
      title: "Design database schemas and data models",
      description:
        "Design schemas for: Users, Courses, Holes, TeeTimeSlots, Bookings, Rounds, Scores, ProShopItems, Orders, Friendships, Notifications. Use PostgreSQL with proper normalization.",
      estimatedHours: 12,
      dependencies: ["po-002", "tl-001"],
      deliverables: ["database/schema.sql", "database/er-diagram.md"],
    },
    {
      id: "db-002",
      title: "Write and optimize complex queries",
      description:
        "Build optimized queries for: leaderboard rankings, handicap calculations, tee-time availability search, course statistics aggregation, user round history.",
      estimatedHours: 10,
      dependencies: ["db-001"],
      deliverables: ["database/queries/"],
    },
    {
      id: "db-003",
      title: "Set up replication, backups, and disaster recovery",
      description:
        "Configure primary-replica replication, automated daily backups, point-in-time recovery, and a disaster recovery runbook.",
      estimatedHours: 8,
      dependencies: ["db-001", "devops-001"],
      deliverables: ["database/backup-strategy.md", "database/disaster-recovery.md"],
    },
    {
      id: "db-004",
      title: "Manage migrations and schema changes",
      description:
        "Set up migration tooling (Prisma Migrate), create initial migration, and establish a versioned migration workflow.",
      estimatedHours: 6,
      dependencies: ["db-001"],
      deliverables: ["database/migrations/"],
    },
    {
      id: "db-005",
      title: "Monitor database performance and scaling",
      description:
        "Set up query performance monitoring, slow query logging, connection pool tuning, and a scaling plan for high-traffic tee-time windows.",
      estimatedHours: 6,
      dependencies: ["db-002", "db-003"],
      deliverables: ["database/performance-monitoring.md"],
    },
  ],

  canRunParallelWith: ["backend-developer", "devops-engineer", "security-engineer"],
};

module.exports = DatabaseAdmin;
