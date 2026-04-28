# 项目移交与公司部署说明

本文档用于把当前项目移交给同事，并指导后续在公司环境中部署使用。

## 1. 当前项目状态

当前代码已经完成以下内容：

- 标注、训练、推理三模块工作台
- 全中文界面
- Electron 桌面启动器，可打包为 Windows exe
- Docker 常驻后端
- 训练/推理任务创建、状态查询、日志查看
- 训练权重命名贯通：`任务名_best.pt`、`任务名_last.pt`
- 标注数据集名称贯通到训练数据集选择
- 推理结果区直接显示识别图片或视频
- 训练/推理任务列表固定高度滚动
- 训练/推理记录删除功能

如果目标是“交给同事继续维护和打包”，当前状态已经够用。

如果目标是“正式交付给公司终端用户”，还需要完成最后一层工程化验收和交付包整理。

## 2. 代码分支

建议统一使用工作分支：

```text
codex/ui-workbench
```

同事接手后建议先执行：

```powershell
git checkout codex/ui-workbench
git pull
```

## 3. 目录说明

核心目录：

```text
annotation/      标注模块后端
training/        训练模块后端
inference_ui/    推理模块后端
templates/       页面模板
static/          前端脚本与样式
desktop/         Electron 桌面端
scripts/         Docker 启停、导入导出、预检、打包脚本
```

运行期目录：

```text
annotation_data/ 标注数据、导出数据集、推理输入输出
runs/            训练输出
weights/         权重文件目录
logs/            日志目录
```

## 4. 本地开发运行方式

### 4.1 启动 Docker 后端

首次构建：

```powershell
cd F:\yolov5-3.0\yolov5-3.0
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1 -Build
```

已构建镜像后直接启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
```

查看状态：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\status_backend.ps1
```

停止后端：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop_backend.ps1
```

### 4.2 启动桌面端

开发模式：

```powershell
cd F:\yolov5-3.0\yolov5-3.0\desktop
npm.cmd install
npm.cmd run start
```

打包 exe：

```powershell
cd F:\yolov5-3.0\yolov5-3.0\desktop
npm.cmd run pack
```

输出目录：

```text
desktop/dist/win-unpacked/
```

## 5. 交给公司前必须确认的事项

### 5.1 最少验收一遍完整链路

必须至少跑通一次：

1. 新建标注数据集
2. 上传图片并完成标注
3. 导出 YOLO 数据集
4. 在训练页选择该数据集并启动训练
5. 训练完成后生成 `任务名_best.pt` / `任务名_last.pt`
6. 在推理页选择训练权重并完成一次推理
7. 在推理结果区直接看到输出图片或视频

### 5.2 确认客户机环境要求

基础要求：

- Windows 10 64 位或 Windows 11 64 位
- Docker Desktop
- 至少 30GB 可用磁盘空间
- 建议 16GB 内存

如果使用 GPU：

- NVIDIA 显卡
- 推荐显存 8GB 及以上
- 驱动版本与 Docker GPU 运行环境兼容
- Docker Desktop GPU 支持正常

### 5.3 运行预检脚本

交付前或客户现场先执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preflight_check.ps1
```

GPU 交付时执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preflight_check.ps1 -RequireGpu
```

## 6. 推荐交付目录

建议客户机统一使用：

```text
C:\YoloApp
```

初始化目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init_delivery_root.ps1 -Root C:\YoloApp
```

初始化后目录建议如下：

```text
C:\YoloApp
  backend\
  desktop\
  data\
  runs\
  weights\
  logs\
```

## 7. 离线交付方式

### 7.1 在开发机导出 Docker 镜像

CPU 版：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save_image.ps1 -Output dist\yolo-workbench-backend.tar
```

GPU 版：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save_image.ps1 -Image yolo-workbench-backend:gpu -Output dist\yolo-workbench-backend-gpu.tar
```

### 7.2 准备交付包

可使用脚本整理：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_release_bundle.ps1 -ImageTar dist\yolo-workbench-backend.tar
```

整理后会生成：

```text
dist\release_bundle\YoloApp
```

### 7.3 在客户机导入镜像并启动

```powershell
cd C:\YoloApp\backend
docker load -i .\yolo-workbench-backend.tar
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
```

然后打开：

```text
C:\YoloApp\desktop\win-unpacked\YOLO工作台.exe
```

## 8. 公司正式应用前建议补做的两件事

### 8.1 GPU 方案单独验收

如果公司现场需要用 GPU 训练，不建议直接跳过验证。至少要确认：

- `nvidia-smi` 正常
- Docker Desktop 已开启 GPU 支持
- `docker-compose.gpu.yml` 可以启动
- 容器内能识别 GPU
- 使用真实训练集跑过一次完整训练

### 8.2 权重与数据管理约定

建议内部明确：

- 初始权重放在哪里
- 训练完成的 `best.pt` / `last.pt` 是否保留全部版本
- 旧训练记录是否定期清理
- 真实业务数据是否允许放在本地目录

## 9. 我对当前项目的判断

当前项目已经完成到“可移交给同事继续维护和打包”的阶段。

如果只要求：

- 做前端
- 做 exe 壳
- 做 Docker 后端接入

那么这部分工作已经完成。

后续真正面向公司部署时，重点不是再改业务逻辑，而是：

- 环境验收
- 离线交付
- GPU 验证
- 现场部署清单
