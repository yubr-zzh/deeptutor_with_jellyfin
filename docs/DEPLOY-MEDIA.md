# DeepTutor 教学平台 · 生产化部署指南

> 适用于把 DeepTutor（课程管理）+ Jellyfin（视频点播）部署到 Linux 服务器的场景。
> 本地 Windows 开发环境不需要本指南 —— 直接 `start-backend-local.cmd` + `next dev --webpack` 即可。

---

## 一、架构总览

```
浏览器 ──► DeepTutor 前端 (Next.js :3782)
             │
             ▼
        DeepTutor 后端 (FastAPI :8001)
          ├─ 课程/视频管理 API
          ├─ 用户认证 (JWT, admin/user)
          └─ 流代理（持 Jellyfin API key，浏览器不接触 key）
             │
             ▼ (容器内网 jellyfin:8096)
        Jellyfin（视频存储/刮削/转码/并发出流）
             ▲
             │ 同一份媒体文件（bind mount）
        ./media/courses/<slug>/S01E01-xxx.mp4
```

**职责边界（重要）：**
- DeepTutor = 课程结构 + 权限 + 流代理（业务层）
- Jellyfin = 视频存储 + 转码 + 多人播放（媒体层）
- 两者通过**约定路径 + 扫描 API** 对齐，不共享数据库

---

## 二、一键部署（Linux + Docker）

### 1. 环境要求
- Linux 服务器（Ubuntu 22.04+ 推荐）
- Docker Engine 24+ + Docker Compose v2
- 至少 4GB RAM、2 核（建议 8GB / 4 核，多人并发更稳）

### 2. 准备文件
```bash
git clone <你的仓库> deeptutor-platform
cd deeptutor-platform
cp .env.example .env
# 编辑 .env：
#   LLM_BINDING / LLM_MODEL / LLM_API_KEY / LLM_HOST   ← 大模型配置（DeepSeek 等）
#   AUTH_ENABLED=true
#   JELLYFIN_URL=http://jellyfin:8096                  ← 容器内网地址（不能用 localhost！）
#   JELLYFIN_API_KEY=<启动 Jellyfin 后在后台生成的 key>
#   JELLYFIN_USER_ID=<Jellyfin 管理员用户 ID>
#   COURSE_MEDIA_ROOT=/app/media
#   NEXT_PUBLIC_API_BASE_EXTERNAL=http://<你的服务器IP或域名>:8001
```

### 3. 启动
```bash
# 构建并启动全部服务（DeepTutor + Jellyfin + 可选 PocketBase）
docker compose -f docker-compose.yml -f docker-compose.media.yml up -d --build
```

### 4. 首次配置 Jellyfin
1. 浏览器打开 `http://<服务器IP>:8096`
2. 完成初始化向导，创建管理员账号（记下用户名 + ID）
3. 管理后台 → 高级 → API 密钥 → 生成 key
4. 把 `JELLYFIN_API_KEY` / `JELLYFIN_USER_ID` 写回 .env → `docker compose up -d` 重启
5. 管理后台 → 媒体库 → 新建"课程库"：
   - 类型：**电视节目（TV Shows）**
   - 路径：`/media/Courses`
   - 关闭**联网刮削**（EnableInternetProviders=false），元数据用文件名

### 5. 访问
- 管理后台：`http://<服务器IP>:3000/admin/courses`（admin 登录）
- 用户点播：`http://<服务器IP>:3000/courses`
- Jellyfin 管理：`http://<服务器IP>:8096`（一般只给管理员，用户不直接碰）

---

## 三、HTTPS（域名上线时）

推荐 **Caddy**（自动 HTTPS，零配置）或 Nginx + certbot：

```bash
# Caddyfile 示例（自动申请 Let's Encrypt 证书）
yourdomain.com {
    reverse_proxy :3000          # 前端
    handle_path /api/* {
        reverse_proxy :8001      # 后端 API（同域代理避免 CORS）
    }
}
```

或 Nginx：
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    # certbot 自动管理证书
    location / { proxy_pass http://127.0.0.1:3000; }
    location /api/ { proxy_pass http://127.0.0.1:8001; }
}
```

**注意：** 走 HTTPS 后，把 `NEXT_PUBLIC_API_BASE_EXTERNAL` 和 `CORS_ORIGIN` 改为 `https://yourdomain.com`。

---

## 四、数据持久化与备份

### 持久化卷（compose 已配置，重启不丢）
| 服务 | 卷 | 内容 |
|---|---|---|
| DeepTutor | `./data/user` | 用户、设置、聊天记录（SQLite） |
| DeepTutor | `./data/memory` | 记忆 |
| DeepTutor | `./data/knowledge_bases` | 知识库 |
| DeepTutor | `./media` | **课程视频（核心资产！）** |
| Jellyfin | `jellyfin-config` | Jellyfin 配置/元数据 |
| Jellyfin | `jellyfin-cache` | 转码缓存（可清） |

### 备份（cron 每日）
```bash
# /etc/cron.d/deeptutor-backup
0 3 * * * root tar czf /backup/deeptutor-$(date +\%F).tar.gz \
  -C /opt/deeptutor-platform data user media \
  && docker exec jellyfin tar czf - /config > /backup/jellyfin-config-$(date +\%F).tar.gz
# 保留最近 7 份
0 4 * * * root find /backup -name '*.tar.gz' -mtime +7 -delete
```

### 恢复
```bash
tar xzf deeptutor-<日期>.tar.gz -C /opt/deeptutor-platform
docker compose -f docker-compose.yml -f docker-compose.media.yml up -d
```

---

## 五、多用户并发

- **Jellyfin 自带**：多用户、转码、并发流（默认无用户数限制，受机器资源约束）
- **DeepTutor**：admin 在 `/admin/users` 创建学生账号；登录后只能浏览/播放，不能管理
- **瓶颈提示**：
  - 4 核机器 ≈ 3-5 路 1080p 软转码；**视频直接播（H.264/AAC mp4）不转码**，吞吐看带宽
  - 100M 上行 ≈ 10-20 路 720p 直出
  - 视频量大了建议加 GPU（Intel QSV / NVIDIA）做转码

---

## 六、常见问题

| 症状 | 原因 | 解决 |
|---|---|---|
| 上传视频后 Jellyfin 没出现 | `JELLYFIN_URL` 用了 localhost | 改为 `http://jellyfin:8096` |
| 课程被识别成"电影" | 库类型错了 | 课程库必须是 TV Shows 类型 |
| 视频名变成奇怪电影名 | 联网刮削没关 | 关闭 EnableInternetProviders |
| 普通用户能看但管理员传不了 | AUTH 配置 | admin 用首个注册账号或 `/admin/users` 创建 |
| 局域网其他电脑打不开 | 只绑了 localhost | 服务器端口放行 3000/8001/8096 |

---

## 七、本地开发（非生产）

```bash
# 后端
.venv\Scripts\python.exe -m deeptutor serve

# 前端（必须 --webpack！Turbopack 在中文路径会 panic）
cd web && node --max-old-space-size=4096 node_modules/next/dist/bin/next dev --webpack

# Jellyfin（Windows 本地）
docker start jellyfin   # 已配置 D:\Media -> /media
```

---

*配套：P0 技术验证结论.md（架构决策与踩坑）、docker-compose.media.yml（生产编排）*
