/**
 * Agent: Full-Stack Developer
 * Phase: Development
 * Role: Works across both frontend and backend, coordinating data flow and making architectural decisions across the entire stack.
 */

const FullStackDeveloper = {
  id: "fullstack-developer",
  name: "Full-Stack Developer",
  role: "Works across both frontend and backend, coordinating data flow and making architectural decisions across the entire stack.",
  phase: "development",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "fs-001",
      title: "Coordinate data flow between client and server",
      description:
        "Design and implement the data contract between frontend and backend: API response shapes, error handling patterns, pagination, and real-time updates for live scoring via WebSockets.",
      estimatedHours: 12,
      dependencies: ["be-001", "fe-003", "tl-001"],
      deliverables: ["src/shared/types/", "src/shared/contracts/"],
    },
    {
      id: "fs-002",
      title: "Build end-to-end feature: Tee-Time Booking",
      description:
        "Implement the complete tee-time booking flow from course search through payment confirmation, spanning frontend UI, API routes, business logic, and database operations.",
      estimatedHours: 20,
      dependencies: ["fe-001", "be-001", "be-003"],
      deliverables: ["src/features/booking/"],
    },
    {
      id: "fs-003",
      title: "Build end-to-end feature: Live Scorecard",
      description:
        "Implement real-time scorecard entry with WebSocket updates, handicap tracking, and leaderboard integration across the full stack.",
      estimatedHours: 18,
      dependencies: ["fe-001", "be-001", "db-001"],
      deliverables: ["src/features/scorecard/"],
    },
    {
      id: "fs-004",
      title: "Build end-to-end feature: User Profile & Social",
      description:
        "Implement user profiles with round history, statistics, friend connections, and activity feeds across frontend and backend.",
      estimatedHours: 14,
      dependencies: ["fe-001", "be-001", "be-003"],
      deliverables: ["src/features/profile/", "src/features/social/"],
    },
    {
      id: "fs-005",
      title: "Make architectural decisions across the stack",
      description:
        "Evaluate and decide on SSR vs CSR for key pages, API caching strategy, real-time infrastructure, and shared validation logic.",
      estimatedHours: 8,
      dependencies: ["tl-001", "tl-002"],
      deliverables: ["architecture-decisions.md"],
    },
  ],

  canRunParallelWith: ["frontend-developer", "backend-developer", "database-admin"],
};

module.exports = FullStackDeveloper;
