const inferenceState = {
  options: null,
  tasks: [],
  selectedTaskId: null,
  pollTimer: null,
};

const inferenceElements = {
  inferenceForm: document.getElementById("inferenceForm"),
  taskName: document.getElementById("taskName"),
  weightsPath: document.getElementById("weightsPath"),
  imgSize: document.getElementById("imgSize"),
  device: document.getElementById("device"),
  confThres: document.getElementById("confThres"),
  iouThres: document.getElementById("iouThres"),
  saveTxt: document.getElementById("saveTxt"),
  inputFile: document.getElementById("inputFile"),
  taskList: document.getElementById("taskList"),
  taskDetail: document.getElementById("taskDetail"),
  artifactLinks: document.getElementById("artifactLinks"),
  resultPreview: document.getElementById("resultPreview"),
  logViewer: document.getElementById("logViewer"),
  statusBar: document.getElementById("statusBar"),
  refreshTasksBtn: document.getElementById("refreshTasksBtn"),
  refreshLogBtn: document.getElementById("refreshLogBtn"),
  stopTaskBtn: document.getElementById("stopTaskBtn"),
};

function setInferenceStatus(message, isError = false) {
  inferenceElements.statusBar.textContent = message;
  inferenceElements.statusBar.style.color = isError ? "#b64027" : "#6f7683";
}

async function inferenceRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload?.message || `Request failed: ${response.status}`);
  }
  return payload.data;
}

function fillWeightSelect(items) {
  inferenceElements.weightsPath.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = `${item.label} (${item.source})`;
    inferenceElements.weightsPath.appendChild(option);
  });
}

async function loadInferenceOptions() {
  inferenceState.options = await inferenceRequest("/api/inference/options");
  fillWeightSelect(inferenceState.options.weights);
}

function renderTaskList() {
  inferenceElements.taskList.innerHTML = "";
  inferenceState.tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = `task-card${task.id === inferenceState.selectedTaskId ? " active" : ""}`;
    card.innerHTML = `
      <h3>${task.name}</h3>
      <div class="meta">Status: ${task.status}</div>
      <div class="meta">Input: ${task.source_name}</div>
      <div class="meta">${task.created_at}</div>
    `;
    card.addEventListener("click", () => selectTask(task.id));
    inferenceElements.taskList.appendChild(card);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    inferenceElements.taskDetail.textContent = "Select a task to view detail.";
    inferenceElements.artifactLinks.innerHTML = "";
    inferenceElements.resultPreview.textContent = "Select a task to view result preview.";
    return;
  }

  inferenceElements.taskDetail.textContent = [
    `Name: ${task.name}`,
    `Status: ${task.status}`,
    `Input file: ${task.source_name}`,
    `Input type: ${task.source_type}`,
    `Weights: ${task.weights}`,
    `Image size: ${task.img_size}`,
    `Conf: ${task.conf_thres}`,
    `IoU: ${task.iou_thres}`,
    `Device: ${task.device}`,
    `Output dir: ${task.output_dir}`,
    `Output file: ${task.output_path}`,
    `Error: ${task.error_message || "-"}`,
  ].join("\n");

  const links = [
    `<a href="/api/inference/tasks/${task.id}/source" target="_blank" rel="noopener noreferrer">Download input file</a>`,
  ];
  if (task.output_exists) {
    links.push(`<a href="/api/inference/tasks/${task.id}/output" target="_blank" rel="noopener noreferrer">Download output file</a>`);
  } else {
    links.push(`<a class="muted">Output file not available yet</a>`);
  }
  inferenceElements.artifactLinks.innerHTML = links.join("");

  if (task.output_exists) {
    const outputUrl = `/api/inference/tasks/${task.id}/output`;
    if (task.source_type === "image") {
      inferenceElements.resultPreview.innerHTML = `<img src="${outputUrl}" alt="Inference result">`;
    } else {
      inferenceElements.resultPreview.innerHTML = `<video controls src="${outputUrl}"></video>`;
    }
  } else {
    inferenceElements.resultPreview.textContent = "Output file not available yet.";
  }
}

async function loadTaskList() {
  inferenceState.tasks = await inferenceRequest("/api/inference/tasks");
  renderTaskList();
}

async function loadTaskLogs(taskId) {
  const payload = await inferenceRequest(`/api/inference/tasks/${taskId}/logs?tail_lines=200`);
  inferenceElements.logViewer.textContent = payload.lines.join("\n");
  inferenceElements.logViewer.scrollTop = inferenceElements.logViewer.scrollHeight;
}

async function selectTask(taskId) {
  inferenceState.selectedTaskId = taskId;
  renderTaskList();
  const task = await inferenceRequest(`/api/inference/tasks/${taskId}`);
  renderTaskDetail(task);
  await loadTaskLogs(taskId);
}

async function createInferenceTask(event) {
  event.preventDefault();
  try {
    const formData = new FormData();
    formData.append("name", inferenceElements.taskName.value.trim());
    formData.append("weights", inferenceElements.weightsPath.value);
    formData.append("img_size", inferenceElements.imgSize.value);
    formData.append("device", inferenceElements.device.value.trim());
    formData.append("conf_thres", inferenceElements.confThres.value);
    formData.append("iou_thres", inferenceElements.iouThres.value);
    if (inferenceElements.saveTxt.checked) {
      formData.append("save_txt", "1");
    }
    if (!inferenceElements.inputFile.files.length) {
      throw new Error("Choose an input file first");
    }
    formData.append("file", inferenceElements.inputFile.files[0]);

    const response = await fetch("/api/inference/tasks", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success === false) {
      throw new Error(payload?.message || "Failed to start inference");
    }

    setInferenceStatus("Inference task started");
    inferenceElements.inferenceForm.reset();
    inferenceElements.device.value = "cpu";
    inferenceElements.imgSize.value = "640";
    inferenceElements.confThres.value = "0.4";
    inferenceElements.iouThres.value = "0.5";
    await loadTaskList();
    await selectTask(payload.data.id);
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
}

async function refreshSelectedTask() {
  if (!inferenceState.selectedTaskId) {
    return;
  }
  const task = await inferenceRequest(`/api/inference/tasks/${inferenceState.selectedTaskId}`);
  renderTaskDetail(task);
  await loadTaskLogs(task.id);
}

function startPolling() {
  if (inferenceState.pollTimer) {
    clearInterval(inferenceState.pollTimer);
  }
  inferenceState.pollTimer = setInterval(async () => {
    try {
      await loadTaskList();
      await refreshSelectedTask();
    } catch (error) {
      setInferenceStatus(error.message, true);
    }
  }, 5000);
}

inferenceElements.inferenceForm.addEventListener("submit", createInferenceTask);
inferenceElements.refreshTasksBtn.addEventListener("click", async () => {
  try {
    await loadTaskList();
    setInferenceStatus("Task list refreshed");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});
inferenceElements.refreshLogBtn.addEventListener("click", async () => {
  try {
    await refreshSelectedTask();
    setInferenceStatus("Log refreshed");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});
inferenceElements.stopTaskBtn.addEventListener("click", async () => {
  if (!inferenceState.selectedTaskId) {
    setInferenceStatus("Select a task first", true);
    return;
  }
  try {
    const task = await inferenceRequest(`/api/inference/tasks/${inferenceState.selectedTaskId}/stop`, {
      method: "POST",
    });
    renderTaskDetail(task);
    await loadTaskList();
    setInferenceStatus("Task stopped");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});

(async function init() {
  try {
    await loadInferenceOptions();
    await loadTaskList();
    startPolling();
    setInferenceStatus("Ready");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
})();
