#!/bin/sh
# =============================================================================
# secret-scan.sh — 密钥扫描（pre-commit 钩子 + 手动扫描共用）
#
# 用法：
#   bash scripts/secret-scan.sh            # 扫描暂存区（git diff --cached）
#   bash scripts/secret-scan.sh --all      # 扫描整个工作区
#
# 退出码：0 = 干净；1 = 发现疑似密钥
# 模式：scripts/secret-patterns.txt（grep -E 语法）
# 说明：本脚本仅拦截"新增/修改"内容中的密钥，历史扫描请用 gitleaks。
# =============================================================================

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
PATTERNS="$ROOT/scripts/secret-patterns.txt"

# 需要跳过合法占位符/示例的行（只保留明确占位符，避免误放过真实 key）
SKIP_RE='(sk-no-key-required|REDACTED|your[_ -]?key|your[_ -]?secret|your[_ -]?token|^\s*#.*(example|placeholder)|xxx|replace[_ -]?me|<your|your_api)'

# 构建正则：合并 patterns 中非注释/非空行
REGEX=$(grep -vE '^\s*#|^\s*$' "$PATTERNS" | tr '\n' '|' | sed 's/|$//')

# 通用赋值模式（单独处理，忽略大小写）
ASSIGN='(api[_-]?key|secret|passwd|password|token)[[:space:]]*[=:][[:space:]]*["'"'"'][A-Za-z0-9_\-]{16,}["'"'"']'

scan_stdin() {
  # 逐行扫描：先跳过匹配 SKIP_RE 的行，再查密钥模式
  while IFS= read -r line; do
    if printf '%s\n' "$line" | grep -qiE "$SKIP_RE"; then
      continue
    fi
    if printf '%s\n' "$line" | grep -nE "$REGEX"; then
      echo "  ⚠ 疑似密钥: $line" >&2
      return 1
    fi
    if printf '%s\n' "$line" | grep -niE "$ASSIGN"; then
      echo "  ⚠ 疑似密钥赋值: $line" >&2
      return 1
    fi
  done
  return 0
}

if [ "$1" = "--all" ]; then
  echo "扫描整个工作区（排除 .git/node_modules/.next/.venv/data）..."
  find . -type f \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './.next/*' \
    -not -path './.venv/*' \
    -not -path './data/*' \
    -not -path './multi-user/*' \
    -not -path './.uv-cache/*' \
    -not -path '*/__pycache__/*' \
    -not -name '*.pyc' \
    -not -name '*.lock' \
    -not -name '.env' \
    -not -name '.env.local' \
    -not -name '.env.*' \
    -print0 | xargs -0 cat 2>/dev/null | scan_stdin
  rc=$?
else
  echo "扫描暂存区（git diff --cached）..."
  git diff --cached -U0 | scan_stdin
  rc=$?
fi

if [ "$rc" = "0" ]; then
  echo "✓ 未发现密钥，通过。"
else
  echo "✗ 检测到疑似密钥！请移除硬编码密钥（改用环境变量）后再提交。"
  echo "  如需查看规范：见 SECURITY.md"
fi
exit "$rc"
