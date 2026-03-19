#!/bin/bash

# ─────────────────────────────────────────
# ForeseesNetwork — Stop Script
# ─────────────────────────────────────────

echo "🛑 Stopping ForeseesNetwork..."
echo ""

# ── Kill port-forwards ──
echo "🔌 Stopping port-forwards..."
if [ -f /tmp/fn-pids.txt ]; then
  while read pid; do
    kill $pid 2>/dev/null
  done < /tmp/fn-pids.txt
  rm /tmp/fn-pids.txt
fi

# Kill any remaining port-forwards
pkill -f "kubectl port-forward" 2>/dev/null
echo "✅ Port-forwards stopped!"
echo ""

# ── Stop Minikube ──
echo "⚙️  Stopping Minikube..."
minikube stop
echo "✅ Minikube stopped!"
echo ""

echo "─────────────────────────────────────"
echo "✅ ForeseesNetwork stopped!"
echo "To start again run: ./start.sh"
echo "─────────────────────────────────────"
