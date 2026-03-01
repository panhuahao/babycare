# bbcare - 移动端胎动记录

这是一个基于 React + Vite + Express + SQLite 构建的移动端优先（Mobile-first）的胎动记录应用。

## 🚀 功能特性

- **胎动记录**：支持点击记录胎动，区分“打嗝”、“伸腿”、“踢脚”等不同动作。
- **数据统计**：
  - 12小时胎动趋势统计。
  - 按日历查看历史记录。
  - 自动识别“有效胎动”（5分钟内连续点击视为一次）。
- **孕期管理**：
  - 计算孕周与预产期进度。
  - 支持记录宝宝名字。
- **数据管理**：
  - 数据持久化（SQLite）。
  - 支持数据备份与恢复（JSON格式）。
  - 支持生成测试数据。
- **容器化**：提供 Docker Compose 一键部署。

## 🛠 技术栈

- **前端**：React 18, Vite, TypeScript
- **后端**：Node.js, Express, better-sqlite3
- **数据库**：SQLite (Local/Volume)
- **部署**：Docker, Docker Compose

## 📦 本地开发

### 前置要求

- Node.js >= 20
- npm

### 启动步骤

1. 安装依赖：
   ```bash
   npm install
   ```

2. 启动开发服务器（同时启动前端和后端）：
   ```bash
   # 终端 1：启动后端 API 服务 (默认端口 3000)
   npm run dev:server

   # 终端 2：启动前端 Vite 服务 (默认端口 5173)
   npm run dev
   ```

3. 访问 http://localhost:5173

### 小工具：今日金价（可选）

“小工具 → 今日金价”默认从金投网（cngold）页面整理数据展示（金价/金店金价/金条/回收），无需配置。

如需改用 Metals.Dev 作为现货贵金属数据源（可选），需要配置环境变量：

```bash
export METALS_DEV_API_KEY=你的_api_key
```

## 🐳 Docker 部署

本项目支持 Docker Compose 一键启动，无需手动配置环境。

### 快速启动

```bash
docker compose up -d --build
```

访问地址：http://localhost:8081

### 自定义端口

如果 8081 端口被占用，可以通过环境变量修改：

```bash
BBCARE_PORT=8082 docker compose up -d --build
```

如需改用 Metals.Dev 数据源，可在启动前设置：

```bash
METALS_DEV_API_KEY=你的_api_key docker compose up -d --build
```

### 数据持久化

数据会持久化到 Docker volume (`bbcare_data`) 中，重启容器不会丢失数据。

## 📝 License

本项目基于 [MIT License](./LICENSE) 开源。
