# 安全规范与密钥管理

> 本文件是项目的"事故记忆"。2026-08 发生过一次 Gemini API key 硬编码泄漏事故，
> 以下是复盘与必须遵守的规范，防止再次发生。

---

## 一、事故复盘（2026-08）

### 时间线

1. **接手迁移**：项目初始化时，将外部源码包 `OpenTutorAi_base/` 整体导入。
   源包 `backend/open_tutorai/config/gemini.py` 中**本就硬编码**了一个真实的
   Gemini API key（`GEMINI_API_KEY = "AIza..."`）。
2. **全量入库**：初始提交 `Initial DeepTutor Plus handoff` 对整个 `backend/` 目录
   原样 `git add` + commit，key 随代码进入 git 历史。
3. **公开推送**：仓库推送到 GitHub 且为**公开仓库**，任何人均可匿名读取
   （`raw.githubusercontent.com` 直接可下载到含 key 的文件）。
4. **发现与修复**：打包交付时进行安全扫描才发现该 key，随后：
   - 交付包内改为环境变量读取
   - 源码改为 `os.getenv("GEMINI_API_KEY", "")`
   - 用 `git filter-repo` 重写全部历史，key 替换为占位符后 force push

### 根因（三层）

| 层面 | 根因 |
|---|---|
| 直接原因 | 第三方源码包自带硬编码 key，迁移时原样导入，未做密钥审计 |
| 放大原因 | 初始提交全量入库 + 仓库公开 + 提交/推送无任何密钥扫描关卡 |
| 流程原因 | "导入外部代码 → 提交 → 打包交付" 每个环节都没有密钥扫描步骤 |

### 影响

- key 在 GitHub 公开期间可被任何人获取，**可能已被滥用**（调用 Gemini 产生费用）。
- 即使已重写历史，公开期间 clone/fork 过仓库的人本地副本中仍保留旧 key。
- **唯一彻底的补救是吊销该 key**（Google Cloud Console → 凭据）。

---

## 二、密钥管理规范（必须遵守）

1. **禁止在源码中硬编码任何密钥**（API key、密码、token、secret）。
   一律通过环境变量或配置文件（`.env`，且 `.env` 不入库）读取。
2. **外部代码导入前必须先扫描**：任何从外部拉入的代码包/目录，
   在 `git add` 前执行一次密钥扫描（见第三节），确认干净再入库。
3. **提交前检查**：本仓库已配置 pre-commit 钩子（见下），含密钥的提交会被拦截。
   若钩子未生效，手动执行 `bash scripts/secret-scan.sh`。
4. **仓库保持私有优先**：如无必要不要把仓库设为公开；公开前做一次全历史扫描。
5. **密钥泄露应急流程**：
   1. 立即**吊销/轮换**该密钥（第一优先级，一劳永逸）
   2. 删除源码中的硬编码，改为环境变量
   3. `git filter-repo` 重写历史（`--replace-text`），force push
   4. 通知可能 clone 过仓库的人重新同步
   5. 评估泄漏窗口内的滥用风险（费用、数据）

---

## 三、自动化防线

### 1. pre-commit 钩子（推荐启用）

```bash
# 安装（脚本本体已随仓库提交，钩子为薄壳）
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
# 或一键：
bash scripts/install-pre-commit.sh
```

钩子会扫描**暂存区新增内容**中的常见密钥格式，命中即拒绝提交：

- Google：`AIza[0-9A-Za-z_-]{30,}`
- OpenAI/DeepSeek 等：`sk-[A-Za-z0-9]{20,}`
- GitHub：`ghp_` / `gho_` / `github_pat_`
- AWS：`AKIA[0-9A-Z]{16}`
- JWT：`eyJ...` 三段式
- 通用赋值：`api_key/secret/token/password = "..."`（忽略大小写，排除 example/xxx 占位符）

### 2. 手动扫描（任何环节可用）

```bash
bash scripts/secret-scan.sh            # 扫描暂存区
bash scripts/secret-scan.sh --all      # 扫描整个工作区
```

### 3. 建议后续接入

- 本地/CI 接入 **gitleaks**（GitHub 官方推荐，支持历史扫描）：
  `gitleaks detect --source .`
- GitHub 开启 **Secret Scanning** + **Push Protection**（仓库 Settings → Code security）。

---

## 四、可复用扫描模式

模式集中维护在 `scripts/secret-patterns.txt`（每行一个正则，`grep -E` 语法），
钩子与手动扫描共用同一份，新增平台时只改这一处。
