/**
 * Orchestrator — Golf Website Project
 *
 * Coordinates all 15 agents across 5 project phases.
 * Agents within the same phase run in parallel when their dependencies are met.
 * Phases execute sequentially: Planning → Design → Development → Testing → Deployment.
 *
 * Usage:
 *   node orchestrator.js --phase=planning    # Run a single phase
 *   node orchestrator.js --phase=all         # Run all phases sequentially
 *   node orchestrator.js --status            # Print project status
 */

const { allAgents, getAgentsByPhase, getAllTasks } = require("./agents");
const workflows = require("./workflows");

// ---------------------------------------------------------------------------
// Phase definitions — order matters
// ---------------------------------------------------------------------------
const PHASES = ["planning", "design", "development", "testing", "deployment"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup of taskId → status so we can check dependency resolution.
 */
function buildTaskIndex(agents) {
  const index = {};
  for (const agent of agents) {
    for (const task of agent.subTasks) {
      index[task.id] = task.status || "pending";
    }
  }
  return index;
}

/**
 * Return true when every dependency of `task` is marked completed.
 */
function dependenciesMet(task, taskIndex) {
  return task.dependencies.every((dep) => taskIndex[dep] === "completed");
}

/**
 * Identify all tasks across agents that are ready to run right now.
 */
function getReadyTasks(agents, taskIndex) {
  const ready = [];
  for (const agent of agents) {
    for (const task of agent.subTasks) {
      if (
        (task.status || "pending") === "pending" &&
        dependenciesMet(task, taskIndex)
      ) {
        ready.push({ agent, task });
      }
    }
  }
  return ready;
}

// ---------------------------------------------------------------------------
// Simulated execution engine
// ---------------------------------------------------------------------------

/**
 * Simulate running a single task (replace with real work dispatch later).
 */
async function executeTask(agent, task) {
  task.status = "in_progress";
  console.log(`  [${agent.id}] ▶  Starting: ${task.title} (${task.id})`);

  // Simulate work — in a real system this dispatches to the actual agent
  await new Promise((resolve) => setTimeout(resolve, 50));

  task.status = "completed";
  console.log(`  [${agent.id}] ✔  Completed: ${task.title}`);
}

/**
 * Run all ready tasks in parallel, then repeat until no more tasks can run.
 */
async function runPhase(phaseName) {
  const agents = getAgentsByPhase(phaseName);
  if (agents.length === 0) {
    console.log(`\nNo agents assigned to phase: ${phaseName}`);
    return;
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  PHASE: ${phaseName.toUpperCase()}`);
  console.log(`  Agents: ${agents.map((a) => a.name).join(", ")}`);
  console.log(`${"═".repeat(70)}`);

  const taskIndex = buildTaskIndex(allAgents); // global index for cross-phase deps

  let wave = 1;
  while (true) {
    const ready = getReadyTasks(agents, taskIndex);
    if (ready.length === 0) break;

    console.log(`\n  ── Wave ${wave} (${ready.length} parallel tasks) ──`);

    // Run all ready tasks concurrently
    await Promise.all(
      ready.map(({ agent, task }) => {
        taskIndex[task.id] = "in_progress";
        return executeTask(agent, task).then(() => {
          taskIndex[task.id] = "completed";
        });
      })
    );

    wave++;
  }

  // Check for tasks that could not run (unmet cross-phase dependencies)
  const blocked = [];
  for (const agent of agents) {
    for (const task of agent.subTasks) {
      if ((task.status || "pending") === "pending") {
        blocked.push({ agent: agent.id, task: task.id, deps: task.dependencies });
      }
    }
  }

  if (blocked.length > 0) {
    console.log(`\n  ⚠  ${blocked.length} task(s) blocked by unmet dependencies:`);
    blocked.forEach((b) =>
      console.log(`     ${b.task} (agent: ${b.agent}) waiting on: ${b.deps.join(", ")}`)
    );
  }
}

// ---------------------------------------------------------------------------
// Status reporter
// ---------------------------------------------------------------------------

function printStatus() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║              GOLF WEBSITE PROJECT — AGENT STATUS                   ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");

  let totalTasks = 0;
  let totalCompleted = 0;

  for (const agent of allAgents) {
    const total = agent.subTasks.length;
    const completed = agent.subTasks.filter((t) => t.status === "completed").length;
    totalTasks += total;
    totalCompleted += completed;
    const pct = Math.round((completed / total) * 100);
    const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
    console.log(
      `║  ${agent.name.padEnd(40)} ${bar} ${String(pct).padStart(3)}%  ║`
    );
  }

  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  const overallPct = Math.round((totalCompleted / totalTasks) * 100);
  console.log(
    `║  OVERALL: ${totalCompleted}/${totalTasks} tasks completed (${overallPct}%)`.padEnd(69) + "  ║"
  );
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
}

// ---------------------------------------------------------------------------
// Dependency graph printer
// ---------------------------------------------------------------------------

function printDependencyGraph() {
  console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
  console.log("│              AGENT PARALLEL EXECUTION GRAPH                         │");
  console.log("└──────────────────────────────────────────────────────────────────────┘\n");

  for (const phase of PHASES) {
    const agents = getAgentsByPhase(phase);
    if (agents.length === 0) continue;

    console.log(`  Phase: ${phase.toUpperCase()}`);
    console.log(`  ${"─".repeat(50)}`);

    // Group agents that can run in parallel
    const parallelGroups = [];
    const placed = new Set();

    for (const agent of agents) {
      if (placed.has(agent.id)) continue;

      const group = [agent];
      placed.add(agent.id);

      if (agent.canRunParallelWith) {
        for (const partnerId of agent.canRunParallelWith) {
          const partner = agents.find((a) => a.id === partnerId);
          if (partner && !placed.has(partner.id)) {
            group.push(partner);
            placed.add(partner.id);
          }
        }
      }

      parallelGroups.push(group);
    }

    for (const group of parallelGroups) {
      if (group.length > 1) {
        console.log(`  ┌─ PARALLEL ──────────────────────────────────┐`);
        group.forEach((a) => console.log(`  │  ◈ ${a.name.padEnd(42)} │`));
        console.log(`  └──────────────────────────────────────────────┘`);
      } else {
        console.log(`  ◇ ${group[0].name} (sequential)`);
      }
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--status")) {
    printStatus();
    printDependencyGraph();
    return;
  }

  const phaseArg = args.find((a) => a.startsWith("--phase="));
  if (!phaseArg) {
    console.log("Usage:");
    console.log("  node orchestrator.js --phase=planning");
    console.log("  node orchestrator.js --phase=all");
    console.log("  node orchestrator.js --status");
    return;
  }

  const phase = phaseArg.split("=")[1];

  if (phase === "all") {
    for (const p of PHASES) {
      await runPhase(p);
    }
  } else if (PHASES.includes(phase)) {
    await runPhase(phase);
  } else {
    console.error(`Unknown phase: ${phase}. Valid phases: ${PHASES.join(", ")}`);
    process.exit(1);
  }

  console.log("\n");
  printStatus();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
