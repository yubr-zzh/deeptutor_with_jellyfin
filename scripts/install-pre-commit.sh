#!/bin/sh
# 安装 pre-commit 密钥扫描钩子
# 用法: bash scripts/install-pre-commit.sh
# 效果: 将 secret-scan.sh 注册为 .git/hooks/pre-commit（薄壳调用）

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<EOF
#!/bin/sh
# 自动生成：密钥扫描钩子（由 scripts/install-pre-commit.sh 安装）
# 扫描暂存区，命中密钥则阻止提交。
exec bash "$ROOT/scripts/secret-scan.sh"
EOF

chmod +x "$HOOK"
echo "✓ pre-commit 钩子已安装: $HOOK"
