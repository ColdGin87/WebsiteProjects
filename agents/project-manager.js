/**
 * Agent: Project Manager
 * Phase: All phases
 * Role: Oversees the entire project lifecycle, ensuring timelines, budgets, and scope are met.
 */

const ProjectManager = {
  id: "project-manager",
  name: "Project Manager",
  role: "Oversees the entire project lifecycle, ensuring timelines, budgets, and scope are met.",
  phase: "all",
  priority: 1,

  subTasks: [
    {
      id: "pm-001",
      title: "Create project plan and timeline",
      description:
        "Define project milestones, deliverables, and a detailed Gantt chart for the golf website.",
      estimatedHours: 8,
      dependencies: [],
      deliverables: ["project-plan.md", "timeline-gantt.md"],
    },
    {
      id: "pm-002",
      title: "Run sprint planning and standups",
      description:
        "Break work into 2-week sprints, assign story points, and allocate tasks to agents.",
      estimatedHours: 4,
      dependencies: ["pm-001", "po-002"],
      deliverables: ["sprint-backlog.md"],
    },
    {
      id: "pm-003",
      title: "Manage stakeholder communication",
      description:
        "Set up communication channels, define RACI matrix, and schedule recurring check-ins.",
      estimatedHours: 3,
      dependencies: ["pm-001"],
      deliverables: ["raci-matrix.md", "communication-plan.md"],
    },
    {
      id: "pm-004",
      title: "Track milestones and resolve blockers",
      description:
        "Monitor progress across all agents, identify blockers, and escalate or resolve issues.",
      estimatedHours: 2,
      recurring: true,
      frequency: "daily",
      dependencies: ["pm-002"],
      deliverables: ["blocker-log.md"],
    },
    {
      id: "pm-005",
      title: "Write status reports",
      description:
        "Compile weekly status reports summarizing progress, risks, and upcoming work.",
      estimatedHours: 2,
      recurring: true,
      frequency: "weekly",
      dependencies: ["pm-004"],
      deliverables: ["weekly-status-report.md"],
    },
  ],

  canRunParallelWith: ["product-manager", "technical-lead"],
};

module.exports = ProjectManager;
