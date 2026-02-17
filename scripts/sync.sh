#!/bin/bash
echo "--- Starting Vanilla Sync & Audit ---"
# 1. 執行單元測試
node --test tests/*.test.js
# 2. 語法檢查
find . -name "*.js" -not -path "./node_modules/*" | xargs -n 1 node -c
# 3. 系統清理
/app/workspace/.gemini/skills/system-cleanup/scripts/cleanup.sh
# 4. 同步遠端
git add .
git commit -m "Auto-sync: automated project maintenance and cleanup"
git push origin master
echo "--- Sync Completed ---"
