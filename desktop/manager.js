const text = {
  ready: "\u5df2\u5c31\u7eea",
  checking: "\u68c0\u67e5\u4e2d",
  offline: "\u672a\u542f\u52a8",
  running: "\u8fd0\u884c\u4e2d",
  unavailable: "\u4e0d\u53ef\u7528",
  available: "\u53ef\u7528",
  unknown: "\u672a\u77e5",
  refreshStatus: "\u5237\u65b0\u540e\u7aef\u72b6\u6001",
  backendAvailable: "\u540e\u7aef\u670d\u52a1\u53ef\u7528\u3002",
  backendUnavailable: "\u540e\u7aef\u670d\u52a1\u4e0d\u53ef\u7528",
  unknownError: "\u672a\u77e5\u9519\u8bef",
  startBackend: "\u542f\u52a8\u540e\u7aef",
  restartBackend: "\u91cd\u542f\u540e\u7aef",
  stopBackend: "\u505c\u6b62\u540e\u7aef",
  dockerStatus: "\u67e5\u770b Docker \u72b6\u6001",
  waiting: "\u7b49\u5f85\u64cd\u4f5c...",
  initFailed: "\u542f\u52a8\u5668\u521d\u59cb\u5316\u5931\u8d25",
};

const elements = {
  serviceBadge: document.getElementById("serviceBadge"),
  backendUrl: document.getElementById("backendUrl"),
  healthText: document.getElementById("healthText"),
  gpuText: document.getElementById("gpuText"),
  versionText: document.getElementById("versionText"),
  projectRoot: document.getElementById("projectRoot"),
  logsDir: document.getElementById("logsDir"),
  output: document.getElementById("output"),
  gpuMode: document.getElementById("gpuMode"),
  refreshBtn: document.getElementById("refreshBtn"),
  openWorkbenchBtn: document.getElementById("openWorkbenchBtn"),
  startBackendBtn: document.getElementById("startBackendBtn"),
  restartBackendBtn: document.getElementById("restartBackendBtn"),
  stopBackendBtn: document.getElementById("stopBackendBtn"),
  statusBtn: document.getElementById("statusBtn"),
  openLogsBtn: document.getElementById("openLogsBtn"),
  openProjectBtn: document.getElementById("openProjectBtn"),
  clearOutputBtn: document.getElementById("clearOutputBtn"),
};

function appendOutput(title, result) {
  const time = new Date().toLocaleString();
  const chunks = [`[${time}] ${title}`];
  if (result?.stdout) {
    chunks.push(result.stdout.trim());
  }
  if (result?.stderr) {
    chunks.push(result.stderr.trim());
  }
  if (!result?.stdout && !result?.stderr && result?.error) {
    chunks.push(result.error);
  }
  elements.output.textContent = chunks.filter(Boolean).join("\n") + "\n\n" + elements.output.textContent;
}

function setBusy(isBusy) {
  [
    elements.refreshBtn,
    elements.startBackendBtn,
    elements.restartBackendBtn,
    elements.stopBackendBtn,
    elements.statusBtn,
    elements.openLogsBtn,
    elements.openProjectBtn,
  ].forEach((button) => {
    button.disabled = isBusy;
  });
  if (isBusy) {
    elements.openWorkbenchBtn.disabled = true;
  }
}

function setHealthUi(health, info) {
  if (health.ok) {
    elements.serviceBadge.textContent = text.ready;
    elements.serviceBadge.className = "service-badge online";
    elements.healthText.textContent = text.running;
    elements.openWorkbenchBtn.disabled = false;
  } else {
    elements.serviceBadge.textContent = text.offline;
    elements.serviceBadge.className = "service-badge offline";
    elements.healthText.textContent = health.error || text.unavailable;
    elements.openWorkbenchBtn.disabled = true;
  }

  if (info?.ok) {
    elements.gpuText.textContent = info.data.gpu_available ? text.available : text.unavailable;
    elements.versionText.textContent = info.data.version || "dev";
  } else {
    elements.gpuText.textContent = text.unknown;
    elements.versionText.textContent = text.unknown;
  }
}

async function refreshStatus({ silent = false } = {}) {
  if (!silent) {
    setBusy(true);
  }
  const health = await window.yoloDesktop.health();
  const info = health.ok ? await window.yoloDesktop.info() : null;
  setHealthUi(health, info);
  if (!silent) {
    appendOutput(text.refreshStatus, {
      stdout: health.ok
        ? text.backendAvailable
        : `${text.backendUnavailable}\uff1a${health.error || text.unknownError}`,
    });
    setBusy(false);
  }
}

async function runAction(title, action) {
  setBusy(true);
  elements.output.textContent = `[${new Date().toLocaleString()}] ${title}...\n\n${elements.output.textContent}`;
  try {
    const result = await action();
    appendOutput(title, result);
  } catch (error) {
    appendOutput(title, { error: error.message });
  } finally {
    await refreshStatus({ silent: true });
    setBusy(false);
  }
}

async function init() {
  const config = await window.yoloDesktop.getConfig();
  elements.backendUrl.textContent = config.backendUrl;
  elements.projectRoot.textContent = config.projectRoot;
  elements.logsDir.textContent = config.logsDir;

  elements.refreshBtn.addEventListener("click", () => refreshStatus());
  elements.openWorkbenchBtn.addEventListener("click", () => window.yoloDesktop.openWorkbench());
  elements.startBackendBtn.addEventListener("click", () => runAction(text.startBackend, () => (
    window.yoloDesktop.startBackend({ gpu: elements.gpuMode.checked })
  )));
  elements.restartBackendBtn.addEventListener("click", () => runAction(text.restartBackend, () => (
    window.yoloDesktop.restartBackend({ gpu: elements.gpuMode.checked })
  )));
  elements.stopBackendBtn.addEventListener("click", () => runAction(text.stopBackend, () => window.yoloDesktop.stopBackend()));
  elements.statusBtn.addEventListener("click", () => runAction(text.dockerStatus, () => window.yoloDesktop.backendStatus()));
  elements.openLogsBtn.addEventListener("click", () => window.yoloDesktop.openLogs());
  elements.openProjectBtn.addEventListener("click", () => window.yoloDesktop.openProjectRoot());
  elements.clearOutputBtn.addEventListener("click", () => {
    elements.output.textContent = text.waiting;
  });

  await refreshStatus({ silent: true });
  setInterval(() => refreshStatus({ silent: true }), 8000);
}

init().catch((error) => {
  appendOutput(text.initFailed, { error: error.message });
});
