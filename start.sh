#!/bin/bash

# ─────────────────────────────────────────
# ForeseesNetwork — Startup Script
# ─────────────────────────────────────────

echo "🚀 Starting ForeseesNetwork..."
echo ""

# ── Start Minikube ──
echo "⚙️  Starting Minikube..."
minikube start
echo "✅ Minikube started!"
echo ""

# ── Wait for pods to be ready ──
echo "⏳ Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod \
  --all -n foreseesnetwork \
  --timeout=120s
echo "✅ All pods ready!"
echo ""

# ── Start port-forwards in background ──
echo "🔌 Starting port-forwards..."

# App (React + Nginx)
kubectl port-forward svc/client-service 5173:80 \
  -n foreseesnetwork &> /tmp/client-pf.log &
CLIENT_PID=$!

# Grafana (optional monitoring)
kubectl port-forward svc/monitoring-grafana 3000:80 \
  -n monitoring &> /tmp/grafana-pf.log &
GRAFANA_PID=$!

# Save PIDs to file for stop script
echo $CLIENT_PID > /tmp/fn-pids.txt
echo $GRAFANA_PID >> /tmp/fn-pids.txt

sleep 2
echo "✅ Port-forwards started!"
echo ""

# ── Print status ──
echo "─────────────────────────────────────"
echo "✅ ForeseesNetwork is running!"
echo ""
echo "🌐 Chat App   → http://localhost:5173"
echo "📊 Grafana    → http://localhost:3000"
echo ""
echo "📦 Pod status:"
kubectl get pods -n foreseesnetwork
echo ""
echo "─────────────────────────────────────"
echo "To stop everything run: ./stop.sh"
echo "─────────────────────────────────────"

# ── Keep script running ──
wait
