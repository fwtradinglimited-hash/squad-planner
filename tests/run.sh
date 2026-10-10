#!/bin/bash
# Runs every browser test in this folder. Exit code is non-zero if any fail.
cd "$(dirname "$0")"
status=0
for f in phase*.js; do
  echo "=== $f"
  timeout 300 node "$f" 2>&1 | grep -v "^\[agent" | grep "FAIL\|passed\|Error" || true
  [ "${PIPESTATUS[0]}" = "0" ] || status=1
done
exit $status
