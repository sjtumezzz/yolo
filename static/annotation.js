const state = {
  datasets: [],
  currentDatasetId: null,
  currentImageId: null,
  classes: [],
  images: [],
  annotations: [],
  selectedAnnotationIndex: -1,
  imageElement: null,
  imageScale: 1,
  offsetX: 0,
  offsetY: 0,
  interaction: null,
};

const canvas = document.getElementById("annotationCanvas");
const ctx = canvas.getContext("2d");
const HANDLE_SIZE = 10;
const API_KEY = document.querySelector('meta[name="api-key"]')?.content || "";
const imageStatusText = {
  unannotated: "未标注",
  annotated: "已标注",
  reviewed: "已审核",
};

const elements = {
  datasetList: document.getElementById("datasetList"),
  datasetForm: document.getElementById("datasetForm"),
  datasetName: document.getElementById("datasetName"),
  datasetDescription: document.getElementById("datasetDescription"),
  splitTrain: document.getElementById("splitTrain"),
  splitVal: document.getElementById("splitVal"),
  splitTest: document.getElementById("splitTest"),
  refreshDatasetsBtn: document.getElementById("refreshDatasetsBtn"),
  currentDatasetName: document.getElementById("currentDatasetName"),
  classForm: document.getElementById("classForm"),
  className: document.getElementById("className"),
  classColor: document.getElementById("classColor"),
  classList: document.getElementById("classList"),
  classSelect: document.getElementById("classSelect"),
  imageInput: document.getElementById("imageInput"),
  imageList: document.getElementById("imageList"),
  saveAnnotationsBtn: document.getElementById("saveAnnotationsBtn"),
  clearAnnotationsBtn: document.getElementById("clearAnnotationsBtn"),
  exportBtn: document.getElementById("exportBtn"),
  prevImageBtn: document.getElementById("prevImageBtn"),
  nextImageBtn: document.getElementById("nextImageBtn"),
  statusBar: document.getElementById("statusBar"),
  imageCounter: document.getElementById("imageCounter"),
};

function setStatus(message, isError = false) {
  elements.statusBar.textContent = message;
  elements.statusBar.style.color = isError ? "#b64027" : "#6f7683";
}

async function requestJson(url, options = {}) {
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

function classById(classId) {
  return state.classes.find((item) => item.id === classId);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAnnotation(annotation) {
  const width = state.imageElement?.width || 0;
  const height = state.imageElement?.height || 0;
  const xMin = clamp(Math.min(annotation.x_min, annotation.x_max), 0, width);
  const yMin = clamp(Math.min(annotation.y_min, annotation.y_max), 0, height);
  const xMax = clamp(Math.max(annotation.x_min, annotation.x_max), 0, width);
  const yMax = clamp(Math.max(annotation.y_min, annotation.y_max), 0, height);
  return {
    ...annotation,
    x_min: xMin,
    y_min: yMin,
    x_max: xMax,
    y_max: yMax,
  };
}

function imageIndex() {
  return state.images.findIndex((item) => item.id === state.currentImageId);
}

function updateImageCounter() {
  const index = imageIndex();
  const current = index >= 0 ? index + 1 : 0;
  elements.imageCounter.textContent = `${current} / ${state.images.length}`;
}

function annotationScreenRect(annotation) {
  return {
    x: state.offsetX + annotation.x_min * state.imageScale,
    y: state.offsetY + annotation.y_min * state.imageScale,
    w: (annotation.x_max - annotation.x_min) * state.imageScale,
    h: (annotation.y_max - annotation.y_min) * state.imageScale,
  };
}

function renderDatasets() {
  elements.datasetList.innerHTML = "";
  state.datasets.forEach((dataset) => {
    const card = document.createElement("div");
    card.className = `dataset-card${dataset.id === state.currentDatasetId ? " active" : ""}`;
    card.innerHTML = `
      <h3>${dataset.name}</h3>
      <div class="meta">图片 ${dataset.total_images} / 已标注 ${dataset.annotated_images}</div>
      <div class="meta">类别 ${dataset.class_count}</div>
    `;
    card.addEventListener("click", () => selectDataset(dataset.id));
    elements.datasetList.appendChild(card);
  });
}

function renderClasses() {
  elements.classList.innerHTML = "";
  elements.classSelect.innerHTML = "";

  if (!state.currentDatasetId) {
    elements.currentDatasetName.textContent = "未选择数据集";
    return;
  }

  const dataset = state.datasets.find((item) => item.id === state.currentDatasetId);
  elements.currentDatasetName.textContent = dataset ? dataset.name : "未选择数据集";

  if (!state.classes.length) {
    const empty = document.createElement("div");
    empty.className = "subtle";
    empty.textContent = "请至少添加一个类别";
    elements.classList.appendChild(empty);
  }

  state.classes.forEach((item) => {
    const row = document.createElement("div");
    row.className = "class-row";
    row.innerHTML = `
      <div class="class-tag">
        <span class="swatch" style="background:${item.color}"></span>
        <span>${item.name}</span>
      </div>
      <button class="ghost" type="button">删除</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      try {
        await requestJson(`/api/annotation/datasets/${state.currentDatasetId}/classes/${item.id}`, {
          method: "DELETE",
        });
        await loadDatasetDetails(state.currentDatasetId);
        setStatus(`已删除类别：${item.name}`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    elements.classList.appendChild(row);

    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    elements.classSelect.appendChild(option);
  });
}

function renderImages() {
  elements.imageList.innerHTML = "";
  state.images.forEach((image) => {
    const card = document.createElement("div");
    card.className = `image-card${image.id === state.currentImageId ? " active" : ""}`;
    card.innerHTML = `
      <h3>${image.original_name}</h3>
      <div class="meta">${image.width} x ${image.height}</div>
      <div class="meta">${imageStatusText[image.status] || image.status} / 标注框 ${image.annotation_count}</div>
    `;
    card.addEventListener("click", () => selectImage(image.id));
    elements.imageList.appendChild(card);
  });
  updateImageCounter();
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.imageElement) {
    ctx.fillStyle = "#8a8f9b";
    ctx.font = "20px sans-serif";
    ctx.fillText("请选择一张图片开始标注", 24, 40);
    return;
  }

  const image = state.imageElement;
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  state.imageScale = scale;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  state.offsetX = (canvas.width - drawWidth) / 2;
  state.offsetY = (canvas.height - drawHeight) / 2;

  ctx.drawImage(image, state.offsetX, state.offsetY, drawWidth, drawHeight);

  state.annotations.forEach((annotation, index) => {
    const klass = classById(annotation.class_id);
    const color = klass?.color || "#00ff00";
    const rect = annotationScreenRect(annotation);

    ctx.lineWidth = index === state.selectedAnnotationIndex ? 3 : 2;
    ctx.strokeStyle = color;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    const label = klass ? klass.name : `类别:${annotation.class_id}`;
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, Math.max(0, rect.y - 22), Math.max(70, label.length * 10), 22);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    ctx.fillText(label, rect.x + 6, Math.max(15, rect.y - 7));

    if (index === state.selectedAnnotationIndex) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(rect.x + rect.w - HANDLE_SIZE, rect.y + rect.h - HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(rect.x + rect.w - HANDLE_SIZE, rect.y + rect.h - HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE);
    }
  });

  if (state.interaction?.type === "draw") {
    const draft = state.interaction;
    ctx.strokeStyle = "#c4582a";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(draft.screenX, draft.screenY, draft.screenW, draft.screenH);
    ctx.setLineDash([]);
  }
}

function canvasToImageCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) * canvas.width) / rect.width;
  const y = ((clientY - rect.top) * canvas.height) / rect.height;
  const imgX = (x - state.offsetX) / state.imageScale;
  const imgY = (y - state.offsetY) / state.imageScale;
  return { canvasX: x, canvasY: y, imgX, imgY };
}

function annotationHitTest(imgX, imgY) {
  for (let i = state.annotations.length - 1; i >= 0; i -= 1) {
    const item = state.annotations[i];
    const nearResizeCorner =
      Math.abs(imgX - item.x_max) <= HANDLE_SIZE / state.imageScale &&
      Math.abs(imgY - item.y_max) <= HANDLE_SIZE / state.imageScale;
    if (nearResizeCorner) {
      return { index: i, mode: "resize" };
    }
    if (imgX >= item.x_min && imgX <= item.x_max && imgY >= item.y_min && imgY <= item.y_max) {
      return { index: i, mode: "move" };
    }
  }
  return { index: -1, mode: null };
}

async function loadDatasets() {
  try {
    state.datasets = await requestJson("/api/annotation/datasets");
    renderDatasets();
    if (state.currentDatasetId && !state.datasets.some((item) => item.id === state.currentDatasetId)) {
      state.currentDatasetId = null;
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadDatasetDetails(datasetId) {
  const dataset = await requestJson(`/api/annotation/datasets/${datasetId}`);
  state.classes = dataset.classes || [];
  renderClasses();
  const imageResult = await requestJson(`/api/annotation/datasets/${datasetId}/images?page=1&page_size=100`);
  state.images = imageResult.items;
  renderImages();
}

async function selectDataset(datasetId) {
  state.currentDatasetId = datasetId;
  state.currentImageId = null;
  state.annotations = [];
  state.imageElement = null;
  state.selectedAnnotationIndex = -1;
  renderDatasets();
  renderCanvas();
  try {
    await loadDatasetDetails(datasetId);
    setStatus("已选择数据集");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function selectImage(imageId) {
  state.currentImageId = imageId;
  state.selectedAnnotationIndex = -1;
  renderImages();
  try {
    const image = await requestJson(`/api/annotation/images/${imageId}`);
    const img = new Image();
    img.onload = () => {
      state.imageElement = img;
      state.annotations = (image.annotations?.items || []).map((item) => ({
        id: item.id,
        class_id: item.class_id,
        x_min: item.x_min,
        y_min: item.y_min,
        x_max: item.x_max,
        y_max: item.y_max,
      }));
      renderCanvas();
    };
    img.src = image.image_url;
    setStatus(`已加载图片：${image.original_name}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function moveImage(step) {
  const index = imageIndex();
  if (index < 0) {
    setStatus("请先选择图片", true);
    return;
  }
  const target = state.images[index + step];
  if (!target) {
    setStatus("没有更多图片");
    return;
  }
  await selectImage(target.id);
}

async function createDataset(event) {
  event.preventDefault();
  try {
    const dataset = await requestJson("/api/annotation/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: elements.datasetName.value.trim(),
        description: elements.datasetDescription.value.trim(),
        split_train: Number(elements.splitTrain.value),
        split_val: Number(elements.splitVal.value),
        split_test: Number(elements.splitTest.value),
      }),
    });
    elements.datasetForm.reset();
    elements.splitTrain.value = "0.8";
    elements.splitVal.value = "0.2";
    elements.splitTest.value = "0.0";
    await loadDatasets();
    await selectDataset(dataset.id);
    setStatus("数据集创建成功");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function createClass(event) {
  event.preventDefault();
  if (!state.currentDatasetId) {
    setStatus("请先选择数据集", true);
    return;
  }
  try {
    await requestJson(`/api/annotation/datasets/${state.currentDatasetId}/classes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: elements.className.value.trim(),
        color: elements.classColor.value,
      }),
    });
    elements.className.value = "";
    await loadDatasetDetails(state.currentDatasetId);
    setStatus("类别添加成功");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function uploadImages(event) {
  if (!state.currentDatasetId) {
    setStatus("请先选择数据集", true);
    event.target.value = "";
    return;
  }
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  try {
    const response = await fetch(`/api/annotation/datasets/${state.currentDatasetId}/images`, withApiKey({
      method: "POST",
      body: formData,
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success === false) {
        throw new Error(payload?.message || "上传失败");
    }
    await loadDatasetDetails(state.currentDatasetId);
    await loadDatasets();
    setStatus(`已上传 ${files.length} 张图片`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.value = "";
  }
}

async function saveAnnotations() {
  if (!state.currentImageId) {
    setStatus("请先选择图片", true);
    return;
  }
  try {
    await requestJson(`/api/annotation/images/${state.currentImageId}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotations: state.annotations.map(normalizeAnnotation) }),
    });
    await loadDatasetDetails(state.currentDatasetId);
    renderImages();
    setStatus("标注已保存");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function exportDataset() {
  if (!state.currentDatasetId) {
    setStatus("请先选择数据集", true);
    return;
  }
  try {
    const result = await requestJson(`/api/annotation/datasets/${state.currentDatasetId}/export`, {
      method: "POST",
    });
    setStatus(`已导出到：${result.export_dir}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

canvas.addEventListener("mousedown", (event) => {
  if (!state.imageElement) {
    return;
  }
  const point = canvasToImageCoords(event.clientX, event.clientY);
  const hit = annotationHitTest(point.imgX, point.imgY);

  if (hit.index >= 0) {
    state.selectedAnnotationIndex = hit.index;
    const selected = state.annotations[hit.index];
    if (hit.mode === "resize") {
      state.interaction = {
        type: "resize",
        index: hit.index,
        startXMax: selected.x_max,
        startYMax: selected.y_max,
      };
    } else {
      state.interaction = {
        type: "move",
        index: hit.index,
        offsetX: point.imgX - selected.x_min,
        offsetY: point.imgY - selected.y_min,
        boxWidth: selected.x_max - selected.x_min,
        boxHeight: selected.y_max - selected.y_min,
      };
    }
    renderCanvas();
    return;
  }

  if (!state.classes.length || !elements.classSelect.value) {
    setStatus("请先添加类别", true);
    return;
  }

  state.selectedAnnotationIndex = -1;
  state.interaction = {
    type: "draw",
    classId: Number(elements.classSelect.value),
    startImgX: point.imgX,
    startImgY: point.imgY,
    endImgX: point.imgX,
    endImgY: point.imgY,
    screenX: point.canvasX,
    screenY: point.canvasY,
    screenW: 0,
    screenH: 0,
  };
  renderCanvas();
});

canvas.addEventListener("mousemove", (event) => {
  if (!state.interaction || !state.imageElement) {
    return;
  }

  const point = canvasToImageCoords(event.clientX, event.clientY);
  const width = state.imageElement.width;
  const height = state.imageElement.height;

  if (state.interaction.type === "draw") {
    state.interaction.endImgX = point.imgX;
    state.interaction.endImgY = point.imgY;
    state.interaction.screenX = Math.min(
      state.offsetX + state.interaction.startImgX * state.imageScale,
      state.offsetX + point.imgX * state.imageScale,
    );
    state.interaction.screenY = Math.min(
      state.offsetY + state.interaction.startImgY * state.imageScale,
      state.offsetY + point.imgY * state.imageScale,
    );
    state.interaction.screenW = Math.abs(point.imgX - state.interaction.startImgX) * state.imageScale;
    state.interaction.screenH = Math.abs(point.imgY - state.interaction.startImgY) * state.imageScale;
  } else if (state.interaction.type === "move") {
    const item = state.annotations[state.interaction.index];
    const nextXMin = clamp(point.imgX - state.interaction.offsetX, 0, width - state.interaction.boxWidth);
    const nextYMin = clamp(point.imgY - state.interaction.offsetY, 0, height - state.interaction.boxHeight);
    item.x_min = nextXMin;
    item.y_min = nextYMin;
    item.x_max = nextXMin + state.interaction.boxWidth;
    item.y_max = nextYMin + state.interaction.boxHeight;
  } else if (state.interaction.type === "resize") {
    const item = state.annotations[state.interaction.index];
    item.x_max = clamp(point.imgX, item.x_min + 1, width);
    item.y_max = clamp(point.imgY, item.y_min + 1, height);
  }

  renderCanvas();
});

canvas.addEventListener("mouseup", () => {
  if (!state.interaction) {
    return;
  }

  if (state.interaction.type === "draw") {
    const xMin = Math.min(state.interaction.startImgX, state.interaction.endImgX);
    const yMin = Math.min(state.interaction.startImgY, state.interaction.endImgY);
    const xMax = Math.max(state.interaction.startImgX, state.interaction.endImgX);
    const yMax = Math.max(state.interaction.startImgY, state.interaction.endImgY);
    if (xMax - xMin >= 4 && yMax - yMin >= 4) {
      state.annotations.push({
        class_id: state.interaction.classId,
        x_min: xMin,
        y_min: yMin,
        x_max: xMax,
        y_max: yMax,
      });
      state.selectedAnnotationIndex = state.annotations.length - 1;
    }
  }

  state.interaction = null;
  renderCanvas();
});

canvas.addEventListener("mouseleave", () => {
  if (state.interaction?.type === "draw") {
    state.interaction = null;
    renderCanvas();
  }
});

window.addEventListener("keydown", async (event) => {
  if (event.key === "Delete" && state.selectedAnnotationIndex >= 0) {
    state.annotations.splice(state.selectedAnnotationIndex, 1);
    state.selectedAnnotationIndex = -1;
    renderCanvas();
  } else if (event.key === "ArrowLeft") {
    await moveImage(-1);
  } else if (event.key === "ArrowRight") {
    await moveImage(1);
  }
});

elements.datasetForm.addEventListener("submit", createDataset);
elements.classForm.addEventListener("submit", createClass);
elements.imageInput.addEventListener("change", uploadImages);
elements.saveAnnotationsBtn.addEventListener("click", saveAnnotations);
elements.clearAnnotationsBtn.addEventListener("click", () => {
  state.annotations = [];
  state.selectedAnnotationIndex = -1;
  renderCanvas();
});
elements.exportBtn.addEventListener("click", exportDataset);
elements.prevImageBtn.addEventListener("click", () => moveImage(-1));
elements.nextImageBtn.addEventListener("click", () => moveImage(1));
elements.refreshDatasetsBtn.addEventListener("click", loadDatasets);

renderCanvas();
loadDatasets();
