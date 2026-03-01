# bbcare（移动端胎动记录）

## 本地开发

```bash
npm install
npm run dev:server
npm run dev
```

## 生产运行（Docker Compose）

本机使用 `docker compose`（不含短横线）：

```bash
docker compose up --build
```

启动后访问：

- http://localhost:8081

如果 8081 端口被占用，可自定义端口：

```bash
BBCARE_PORT=8082 docker compose up --build
```

数据会持久化到 Docker volume（SQLite），重启容器不会丢失。
# babycare
