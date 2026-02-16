#!/bin/bash
# TeleNexus Project Sync Tool
echo "--- Starting Project Maintenance ---"
# 執行測試
node --test tests/*.test.js
if [ $? -eq 0 ]; then
    echo "✅ Tests passed."
    # 執行提交與推送
    git add .
    git commit -m "Auto-maintenance: automated sync and cleanup at $(date)"
    git push origin master
    echo "🚀 Sync completed."
else
    echo "❌ Tests failed. Sync aborted."
    exit 1
fi
# 觸發系統清理
/app/workspace/.gemini/skills/system-cleanup/scripts/cleanup.sh
