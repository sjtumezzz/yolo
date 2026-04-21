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
const API_KEY = document.querySelector('meta[name="api-key"]')?.content || "";
const inferenceStatusText = {
  pending: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
};
const sourceTypeText = {
  image: "图片",
  video: "视频",
};
const weightSourceText = {
  root: "根目录",
  weights: "权重目录",
  runs: "训练结果",
};

function setInferenceStatus(message, isError = false) {
  inferenceElements.statusBar.textContent = message;
  inferenceElements.statusBar.style.color = isError ? "#b64027" : "#6f7683";
}

async function inferenceRequest(url, options = {}) {
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

function fillWeightSelect(items) {
  inferenceElements.weightsPath.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = `${item.label} (${weightSourceText[item.source] || item.source})`;
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
      <div class="meta">状态：${inferenceStatusText[task.status] || task.status}</div>
      <div class="meta">输入：${task.source_name}</div>
      <div class="meta">${task.created_at}</div>
    `;
    card.addEventListener("click", () => selectTask(task.id));
    inferenceElements.taskList.appendChild(card);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    inferenceElements.taskDetail.textContent = "请选择一个任务查看详情。";
    inferenceElements.artifactLinks.innerHTML = "";
    inferenceElements.resultPreview.textContent = "请选择一个任务查看结果预览。";
    return;
  }

  inferenceElements.taskDetail.textContent = [
    `任务名称：${task.name}`,
    `状态：${inferenceStatusText[task.status] || task.status}`,
    `输入文件：${task.source_name}`,
    `输入类型：${sourceTypeText[task.source_type] || task.source_type}`,
    `权重：${task.weights}`,
    `图片尺寸：${task.img_size}`,
    `置信度：${task.conf_thres}`,
    `IoU 阈值：${task.iou_thres}`,
    `设备：${task.device}`,
    `输出目录：${task.output_dir}`,
    `输出文件：${task.output_path}`,
    `错误信息：${task.error_message || "-"}`,
  ].join("\n");

  const links = [
    `<a href="/api/inference/tasks/${task.id}/source" target="_blank" rel="noopener noreferrer">下载输入文件</a>`,
  ];
  if (task.output_exists) {
    links.push(`<a href="/api/inference/tasks/${task.id}/output" target="_blank" rel="noopener noreferrer">下载输出文件</a>`);
  } else {
    links.push(`<a class="muted">输出文件暂不可用</a>`);
  }
  inferenceElements.artifactLinks.innerHTML = links.join("");

  if (task.output_exists) {
    const outputUrl = `/api/inference/tasks/${task.id}/output`;
    if (task.source_type === "image") {
      inferenceElements.resultPreview.innerHTML = `<img src="${outputUrl}" alt="推理结果">`;
    } else {
      inferenceElements.resultPreview.innerHTML = `<video controls src="${outputUrl}"></video>`;
    }
  } else {
    inferenceElements.resultPreview.textContent = "输出文件暂不可用。";
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
      throw new Error("请先选择输入文件");
    }
    formData.append("file", inferenceElements.inputFile.files[0]);

    const response = await fetch("/api/inference/tasks", withApiKey({
      method: "POST",
      body: formData,
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success === false) {
      throw new Error(payload?.message || "启动推理失败");
    }

    setInferenceStatus("推理任务已启动");
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
    setInferenceStatus("任务列表已刷新");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});
inferenceElements.refreshLogBtn.addEventListener("click", async () => {
  try {
    await refreshSelectedTask();
    setInferenceStatus("日志已刷新");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});
inferenceElements.stopTaskBtn.addEventListener("click", async () => {
  if (!inferenceState.selectedTaskId) {
    setInferenceStatus("请先选择任务", true);
    return;
  }
  try {
    const task = await inferenceRequest(`/api/inference/tasks/${inferenceState.selectedTaskId}/stop`, {
      method: "POST",
    });
    renderTaskDetail(task);
    await loadTaskList();
    setInferenceStatus("任务已停止");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
});

(async function init() {
  try {
    await loadInferenceOptions();
    await loadTaskList();
    startPolling();
    setInferenceStatus("准备就绪");
  } catch (error) {
    setInferenceStatus(error.message, true);
  }
})();
