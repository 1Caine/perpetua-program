#!/usr/bin/env bash
# Runs a large fuzz campaign in batches (LiteSVM keeps native memory per VM until exit).
# usage: scripts/fuzz-campaign.sh <seed> <total-sequences> [batch]
set -euo pipefail
SEED=${1:-20261108}; TOTAL=${2:-2000}; BATCH=${3:-200}
cd "$(dirname "$0")/.."
for ((start=1; start<=TOTAL; start+=BATCH)); do
  FUZZ_SEED=$SEED FUZZ_START=$start FUZZ_SEQ=$BATCH FUZZ_SUBST=$((BATCH/10)) node --import tsx tests/fuzz.ts | tail -1
done
echo "campaign seed=$SEED sequences=$TOTAL passed"
