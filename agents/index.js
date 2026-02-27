/**
 * Agent Registry
 * Central export of all 15 project agents for the golf website.
 */

const ProjectManager = require("./project-manager");
const ProductManager = require("./product-manager");
const UXDesigner = require("./ux-designer");
const UIDesigner = require("./ui-designer");
const FrontendDeveloper = require("./frontend-developer");
const BackendDeveloper = require("./backend-developer");
const FullStackDeveloper = require("./fullstack-developer");
const DatabaseAdmin = require("./database-admin");
const DevOpsEngineer = require("./devops-engineer");
const QAEngineer = require("./qa-engineer");
const SecurityEngineer = require("./security-engineer");
const TechnicalLead = require("./technical-lead");
const ContentStrategist = require("./content-strategist");
const SEOSpecialist = require("./seo-specialist");
const DataAnalyst = require("./data-analyst");

const allAgents = [
  ProjectManager,
  ProductManager,
  UXDesigner,
  UIDesigner,
  FrontendDeveloper,
  BackendDeveloper,
  FullStackDeveloper,
  DatabaseAdmin,
  DevOpsEngineer,
  QAEngineer,
  SecurityEngineer,
  TechnicalLead,
  ContentStrategist,
  SEOSpecialist,
  DataAnalyst,
];

/**
 * Look up an agent by its id.
 */
function getAgent(id) {
  return allAgents.find((a) => a.id === id) || null;
}

/**
 * Return every sub-task across all agents as a flat list.
 */
function getAllTasks() {
  return allAgents.flatMap((agent) =>
    agent.subTasks.map((task) => ({ ...task, agentId: agent.id, agentName: agent.name }))
  );
}

/**
 * Return agents that belong to a specific phase.
 */
function getAgentsByPhase(phase) {
  return allAgents.filter((a) => a.phase === phase || a.phase === "all");
}

module.exports = {
  allAgents,
  getAgent,
  getAllTasks,
  getAgentsByPhase,
  // Named exports for convenience
  ProjectManager,
  ProductManager,
  UXDesigner,
  UIDesigner,
  FrontendDeveloper,
  BackendDeveloper,
  FullStackDeveloper,
  DatabaseAdmin,
  DevOpsEngineer,
  QAEngineer,
  SecurityEngineer,
  TechnicalLead,
  ContentStrategist,
  SEOSpecialist,
  DataAnalyst,
};
