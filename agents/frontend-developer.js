/**
 * Agent: Frontend Developer
 * Phase: Development
 * Role: Implements the user-facing side of the application in code.
 */

const FrontendDeveloper = {
  id: "frontend-developer",
  name: "Frontend Developer",
  role: "Implements the user-facing side of the application in code.",
  phase: "development",
  parallel: true,
  priority: 3,

  subTasks: [
    {
      id: "fe-001",
      title: "Build UI components (React)",
      description:
        "Implement reusable React components from the design system: CourseCard, BookingWidget, ScorecardTable, LeaderboardRow, ProShopItem, NavBar, Footer.",
      estimatedHours: 30,
      dependencies: ["ui-002", "ui-005", "tl-001"],
      deliverables: ["src/components/"],
    },
    {
      id: "fe-002",
      title: "Implement responsive layouts with HTML/CSS",
      description:
        "Build responsive page layouts using CSS Grid/Flexbox and Tailwind CSS for all breakpoints defined in design specs.",
      estimatedHours: 20,
      dependencies: ["ui-004", "fe-001"],
      deliverables: ["src/layouts/", "src/styles/"],
    },
    {
      id: "fe-003",
      title: "Integrate APIs and manage application state",
      description:
        "Connect frontend to backend APIs for courses, bookings, scores, users, and pro shop. Implement state management with React Context or Zustand.",
      estimatedHours: 24,
      dependencies: ["be-001", "fe-001"],
      deliverables: ["src/api/", "src/store/"],
    },
    {
      id: "fe-004",
      title: "Optimize performance",
      description:
        "Optimize load times, rendering, and bundle size: code splitting, lazy loading, image optimization, memoization, Lighthouse audit targeting 90+ scores.",
      estimatedHours: 12,
      dependencies: ["fe-002", "fe-003"],
      deliverables: ["performance-report.md"],
    },
    {
      id: "fe-005",
      title: "Write unit and integration tests for frontend",
      description:
        "Write tests using Jest and React Testing Library for all components, hooks, and API integration layers. Target 80%+ coverage.",
      estimatedHours: 16,
      dependencies: ["fe-001", "fe-003"],
      deliverables: ["src/__tests__/"],
    },
  ],

  canRunParallelWith: ["backend-developer", "content-strategist", "seo-specialist"],
};

module.exports = FrontendDeveloper;
