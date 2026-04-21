const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const BACKEND_PORT = process.env.YOLO_BACKEND_PORT || "5001";
const BACKEND_URL = process.env.YOLO_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow;

function getProjectRoot() {
  if (process.env.YOLO_APP_ROOT) {
    return process.env.YOLO_APP_ROOT;
  }
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, "..");
}

const PROJECT_ROOT = getProjectRoot();
const SCRIPTS_DIR = path.join(PROJECT_ROOT, "scripts");
const LOGS_DIR = process.env.YOLO_APP_LOGS || path.join(PROJECT_ROOT, "logs");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "YOLO\u5de5\u4f5c\u53f0",
    backgroundColor: "#f4efe6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "\u670d\u52a1\u7ba1\u7406",
      submenu: [
        {
          label: "\u6253\u5f00\u542f\u52a8\u5668",
          click: () => mainWindow.loadFile(path.join(__dirname, "manager.html")),
        },
        {
          label: "\u6253\u5f00\u5de5\u4f5c\u53f0",
          click: () => mainWindow.loadURL(BACKEND_URL),
        },
        {
          label: "\u6253\u5f00\u65e5\u5fd7\u76ee\u5f55",
          click: () => {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
            shell.openPath(LOGS_DIR);
          },
        },
        { type: "separator" },
        {
          label: "\u9000\u51fa",
          role: "quit",
        },
      ],
    },
  ]));

  mainWindow.loadFile(path.join(__dirname, "manager.html"));
}

function requestJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body || "{}") });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("\u8bf7\u6c42\u8d85\u65f6"));
    });
    req.on("error", reject);
  });
}

async function getHealth() {
  try {
    const response = await requestJson(`${BACKEND_URL}/api/health`);
    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      data: response.body,
      backendUrl: BACKEND_URL,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      backendUrl: BACKEND_URL,
    };
  }
}

async function getInfo() {
  try {
    const response = await requestJson(`${BACKEND_URL}/api/info`);
    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      data: response.body.data || response.body,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

function runPowerShell(scriptName, args = []) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: `\u811a\u672c\u4e0d\u5b58\u5728\uff1a${scriptPath}`,
    });
  }

  return new Promise((resolve) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
      {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        env: {
          ...process.env,
          YOLO_BACKEND_PORT: BACKEND_PORT,
          YOLO_BACKEND_URL: BACKEND_URL,
        },
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code || 0,
          stdout,
          stderr,
        });
      },
    );
    child.stdin?.end();
  });
}

ipcMain.handle("backend:health", getHealth);
ipcMain.handle("backend:info", getInfo);

ipcMain.handle("backend:start", (_event, options = {}) => {
  const args = [];
  if (options.build) {
    args.push("-Build");
  }
  if (options.gpu) {
    args.push("-Gpu");
  }
  if (options.imageTar) {
    args.push("-ImageTar", options.imageTar);
  }
  return runPowerShell("start_backend.ps1", args);
});

ipcMain.handle("backend:stop", () => runPowerShell("stop_backend.ps1"));

ipcMain.handle("backend:restart", async (_event, options = {}) => {
  const stopResult = await runPowerShell("stop_backend.ps1");
  const args = [];
  if (options.gpu) {
    args.push("-Gpu");
  }
  const startResult = await runPowerShell("start_backend.ps1", args);
  return {
    ok: stopResult.ok && startResult.ok,
    code: startResult.code,
    stdout: `${stopResult.stdout}\n${startResult.stdout}`,
    stderr: `${stopResult.stderr}\n${startResult.stderr}`,
  };
});

ipcMain.handle("backend:status", () => runPowerShell("status_backend.ps1"));

ipcMain.handle("app:openWorkbench", async () => {
  mainWindow.loadURL(BACKEND_URL);
  return { ok: true };
});

ipcMain.handle("app:openManager", async () => {
  mainWindow.loadFile(path.join(__dirname, "manager.html"));
  return { ok: true };
});

ipcMain.handle("app:openLogs", async () => {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  await shell.openPath(LOGS_DIR);
  return { ok: true, path: LOGS_DIR };
});

ipcMain.handle("app:openProjectRoot", async () => {
  await shell.openPath(PROJECT_ROOT);
  return { ok: true, path: PROJECT_ROOT };
});

ipcMain.handle("app:getConfig", () => ({
  backendUrl: BACKEND_URL,
  projectRoot: PROJECT_ROOT,
  logsDir: LOGS_DIR,
}));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
