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
const API_KEY = document.querySelector('meta[name="api-key"]')?.content || "";
const taskStatusText = {
  pending: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
};
const sourceText = {
  annotation_export: "标记导出",
  builtin: "内置配置",
  weights: "权重目录",
  root: "根目录",
  runs: "训练结果",
  custom: "自定义",
};

function setTrainingStatus(message, isError = false) {
  trainingElements.statusBar.textContent = message;
  trainingElements.statusBar.style.color = isError ? "#b64027" : "#6f7683";
}

async function trainingRequest(url, options = {}) {
  const response = await fetch(url, withApiKey(options));
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload?.message || `请求失败：${response.status}`);
  }
  return payload.data;
}

function withApiKey(options = {}) {
  if (!API_KEY) {
    return options;
  }
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-API-Key": API_KEY,
    },
  };
}

function fillSelect(select, items) {
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = `${item.label} (${sourceText[item.source || "custom"] || item.source || "自定义"})`;
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
      <div class="meta">状态：${taskStatusText[task.status] || task.status}</div>
      <div class="meta">轮数：${task.epochs} | 批大小：${task.batch_size}</div>
      <div class="meta">${task.created_at}</div>
    `;
    card.addEventListener("click", () => selectTask(task.id));
    trainingElements.taskList.appendChild(card);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    trainingElements.taskDetail.textContent = "请选择一个任务查看详情。";
    trainingElements.artifactLinks.innerHTML = "";
    return;
  }
  trainingElements.taskDetail.textContent = [
    `任务名称：${task.name}`,
    `状态：${taskStatusText[task.status] || task.status}`,
    `数据集：${task.dataset_yaml}`,
    `权重：${task.weights}`,
    `模型配置：${task.model_cfg}`,
    `训练轮数：${task.epochs}`,
    `批大小：${task.batch_size}`,
    `图片尺寸：${task.img_size}`,
    `设备：${task.device || "默认"}`,
    `继续训练：${task.resume ? "是" : "否"}`,
    `输出目录：${task.output_dir}`,
    `best.pt：${task.best_weight || "暂不可用"}`,
    `last.pt：${task.last_weight || "暂不可用"}`,
    `错误信息：${task.error_message || "-"}`,
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
        `<a href="/api/training/tasks/${task.id}/artifacts/${key}" target="_blank" rel="noopener noreferrer">下载 ${label}</a>`,
      );
    } else {
      links.push(`<a class="muted">${label} 暂不可用</a>`);
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
    setTrainingStatus("训练任务已启动");
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
    setTrainingStatus("任务列表已刷新");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});
trainingElements.refreshLogBtn.addEventListener("click", async () => {
  try {
    await refreshSelectedTask();
    setTrainingStatus("日志已刷新");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});
trainingElements.stopTaskBtn.addEventListener("click", async () => {
  if (!trainingState.selectedTaskId) {
    setTrainingStatus("请先选择任务", true);
    return;
  }
  try {
    const task = await trainingRequest(`/api/training/tasks/${trainingState.selectedTaskId}/stop`, {
      method: "POST",
    });
    renderTaskDetail(task);
    await loadTaskList();
    setTrainingStatus("任务已停止");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
});

(async function init() {
  try {
    await loadTrainingOptions();
    await loadTaskList();
    startPolling();
    setTrainingStatus("准备就绪");
  } catch (error) {
    setTrainingStatus(error.message, true);
  }
})();
