#!/usr/bin/env bash
# 在本機依序執行 CI（.github/workflows/deploy.yml）的所有檢查；只檢查，不修改、不 commit、不 push。
#   scripts/check.sh           全部檢查（瀏覽器測試約 1.5 分鐘，需要 Node 22+ 與本機 Chrome）
#   scripts/check.sh --quick   略過瀏覽器測試
# 版本號與 ADR 索引不一致時，依提示執行對應的腳本後再提交。
set -uo pipefail
cd "$(dirname "$0")/.."

quick=false
[[ "${1:-}" == "--quick" ]] && quick=true

failed=()
step() {
    local name="$1"; shift
    echo "▶ ${name}"
    if "$@"; then
        echo "  ✓ ${name}"
    else
        echo "  ✗ ${name}"
        failed+=("$name")
    fi
}

syntax_check() {
    find . \( -name "*.js" -o -name "*.mjs" \) -not -path "./node_modules/*" -not -path "./.git/*" -print0 \
        | xargs -0 -n 1 node -c
}

step "單元測試" node --test --test-reporter=dot tests/*.test.js
step "語法檢查" syntax_check
# 版本號只計算 git 追蹤中的檔案：新檔案要先 git add，否則這裡會漏算
step "Service Worker 版本號（不一致時執行 node scripts/update-sw-version.js）" node scripts/update-sw-version.js --check
step "ADR 索引（不一致時執行 node scripts/update-adr-index.js）" node scripts/update-adr-index.js --check
if $quick; then
    echo "（--quick：略過瀏覽器測試）"
else
    step "瀏覽器測試" node tests/browser-runner.mjs
fi

echo
if ((${#failed[@]})); then
    echo "❌ ${#failed[@]} 項失敗："
    printf '   - %s\n' "${failed[@]}"
    exit 1
fi
echo "✅ 全部通過"
