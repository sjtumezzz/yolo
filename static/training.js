const trainingState = {
  options: null,
  tasks: [],
  selectedTaskId: null,
  pollTimer: null,
};

const trainingElements = {
  trainingForm: document.getElementById("trainingForm"),
  taskName: document.getElementById("taskName"),
  datasetYaml: document.getElementById("datasetYaml"),
  weightsPath: document.getElementById("weightsPath"),
  modelCfg: document.getElementById("modelCfg"),
  epochs: document.getElementById("epochs"),
  batchSize: document.getElementById("batchSize"),
  imgSize: document.getElementById("imgSize"),
  device: document.getElementById("device"),
  resume: document.getElementById("resume"),
  taskList: document.getElementById("taskList"),
  taskDetail: document.getElementById("taskDetail"),
  logViewer: document.getElementById("logViewer"),
  artifactLinks: document.getElementById("artifactLinks"),
  statusBar: document.getElementById("statusBar"),
  refreshTasksBtn: document.getElementById("refreshTasksBtn"),
  refreshLogBtn: document.getElementById("refreshLogBtn"),
  stopTaskBtn: document.getElementById("stopTaskBtn"),
};

function setTrainingStatus(message, isError = false) {
  trainingElements.statusBar.textContent = message;
  trainingElements.statusBar.style.color = isError ? "#b64027" : "#6f7683";
}

async function trainingRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload?.message || `Request failed: ${response.status}`);
  }
  return payload.data;
}

function fillSelect(select, items) {
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = `${item.label} (${item.source || "custom"})`;
    select.appendChild(option);
  });
}

async function loadTrainingOptions() {
  trainingState.options = await trainingRequest("/api/training/options");
  fillSelect(trainingElements.datasetYaml, trainingState.options.datasets);
  fillSelect(trainingElements.weightsPath, trainingState.options.weights);
  fillSelect(trainingElements.modelCfg, trainingState.options.models);
}

function renderTaskList() {
  trainingElements.taskList.innerHTML = "";
  trainingState.tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = `task-card${task.id === trainingState.selectedTaskId ? " active" : ""}`;
    card.innerHTML = `
      <h3>${task.name}</h3>
      <div class="meta">Status: ${task.status}</div>
      <div class="meta">Epochs: ${task.epochs} | Batch: ${task.batch_size}</div>
      <div class="meta">${task.created_at}</div>
    `;
    card.addEventListener("click", () => selectTask(task.id));
    trainingElements.taskList.appendChild(card);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    trainingElements.taskDetail.textContent = "Select a task to view detail.";
    trainingElements.artifactLinks.innerHTML = "";
    return;
  }
  trainingElements.taskDetail.textContent = [
    `Name: ${task.name}`,
    `Status: ${task.status}`,
    `Dataset: ${task.dataset_yaml}`,
    `Weights: ${task.weights}`,
    `Model cfg: ${task.model_cfg}`,
    `Epochs: ${task.epochs}`,
    `Batch size: ${task.batch_size}`,
    `Image size: ${task.img_size}`,
    `Device: ${task.device || "default"}`,
    `Resume: ${task.resume ? "yes" : "no"}`,
    `Output dir: ${task.output_dir}`,
    `best.pt: ${task.best_weight || "not available yet"}`,
    `last.pt: ${task.last_weight || "not available yet"}`,
    `Error: ${task.error_message || "-"}`,
  ].join("\n");

  const links = [];
  const artifactDefs = [
    ["best", "best.pt", task.best_exists],
    ["last", "last.pt", task.last_exists],
    ["results_png", "results.png", task.artifact_exists?.results_png],
    ["results_txt", "results.txt", task.artifact_exists?.results_txt],
    ["hyp_yaml", "hyp.yaml", task.artifact_exists?.hyp_yaml],
    ["opt_yaml", "opt.yaml", task.artifact_exists?.opt_yaml],
  ];
  artifactDefs.forEach(([key, label, exists]) => {
    if (exists) {
      links.push(
        `<a href="/api/training/tasks/${task.id}/artifacts/${key}" target="_blank" rel="noopener noreferrer">Download ${label}</a>`,
      );
    } else {
      links.push(`<a class="muted">${label} not available yet</a>`);
    }
  });
  trainingElements.artifactLinks.innerHTML = links.join("");
}

async function loadTaskList() {
  trainingState.tasks = await trainingRequest("/api/training/tasks");
  renderTaskList();
}

async function loadTaskLogs(taskId) {
  const payload = await trainingRequest(`/api/training/tasks/${taskId}/logs?tail_lines=200`);
  trainingElements.logViewer.textContent = payload.lines.join("\n");
  trainingElements.logViewer.scrollTop = trainingElements.logViewer.scrollHeight;
}

async function selectTask(taskId) {
  trainingState.selectedTaskId = taskId;
  renderTaskList();
  const task = await trainingRequest(`/api/training/tasks/${taskId}`);
  renderTaskDetail(task);
  await loadTaskLogs(taskId);
}

async function createTrainingTask(event) {
  event.preventDefault();
  try {
    const task = await trainingRequest("/api/training/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trainingElements.taskName.value.trim(),
        dataset_yaml: trainingElements.datasetYaml.value,
        weights: trainingElements.weightsPath.value,
        model_cfg: trainingElements.modelCfg.value,
        epochs: Number(trainingElements.epochs.value),
        batch_size: Number(trainingElements.batchSize.value),
        img_size: Number(trainingElements.imgSize.value),
        device: trainingElements.device.value.trim(),
        resume: trainingElements.resume.checked,
      }),
    });
    setTrainingStatus("Training task started");
    await loadTaskList();
    await selectTask(task.id);
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
}

async function refreshSelectedTask() {
  if (!trainingState.selectedTaskId) {
    return;
  }
  try {
    const task = await trainingRequest(`/api/training/tasks/${trainingState.selectedTaskId}`);
    renderTaskDetail(task);
    await loadTaskLogs(task.id);
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
}

function startPolling() {
  if (trainingState.pollTimer) {
    clearInterval(trainingState.pollTimer);
  }
  trainingState.pollTimer = setInterval(async () => {
    try {
      await loadTaskList();
      await refreshSelectedTask();
    } catch (error) {
      setTrainingStatus(error.message, true);
    }
  }, 5000);
}

trainingElements.trainingForm.addEventListener("submit", createTrainingTask);
trainingElements.refreshTasksBtn.addEventListener("click", async () => {
  try {
    await loadTaskList();
    setTrainingStatus("Task list refreshed");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});
trainingElements.refreshLogBtn.addEventListener("click", async () => {
  try {
    await refreshSelectedTask();
    setTrainingStatus("Log refreshed");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});
trainingElements.stopTaskBtn.addEventListener("click", async () => {
  if (!trainingState.selectedTaskId) {
    setTrainingStatus("Select a task first", true);
    return;
  }
  try {
    const task = await trainingRequest(`/api/training/tasks/${trainingState.selectedTaskId}/stop`, {
      method: "POST",
    });
    renderTaskDetail(task);
    await loadTaskList();
    setTrainingStatus("Task stopped");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});

(async function init() {
  try {
    await loadTrainingOptions();
    await loadTaskList();
    startPolling();
    setTrainingStatus("Ready");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
})();
