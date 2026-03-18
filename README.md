# ForeseesNetwork — Cloud-Native Real-Time Chat Platform

A production-grade real-time chat application built with a complete DevOps pipeline — containerized, orchestrated, auto-scaled, continuously deployed, and monitored.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                     │
│   git push → Build Docker → Load to Minikube → Deploy K8s   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Kubernetes Cluster (Minikube)                  │
│  Namespace: foreseesnetwork                                 │
│                                                             │
│  ┌───────────┐    ┌───────────┐                             │
│  │  React    │───▶│  Node.js  │                             │
│  │  (Nginx)  │    │  Express  │                             │
│  │  Port 80  │    │  Port 4000│                             │
│  └───────────┘    └─────┬─────┘                             │
│     HPA ↕ (1-10)        │          HPA ↕ (1-10)             │
│                    ┌────▼──────────────────┐                │
│                    │                       │                │
│             ┌──────▼──────┐    ┌───────────▼──┐             │
│             │  PostgreSQL │    │    Redis     │             │
│             │  Port 5432  │    │   Port 6379  │             │
│             │  (PVC 1Gi)  │    │  (Sessions)  │             │
│             └─────────────┘    └──────────────┘             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Prometheus + Grafana (Monitoring & Alerting)        │
│   Metrics Collection │ Dashboards │ Email Alerts            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🌐 Ports & Connections

### How everything connects:

```
Your Browser
     │
     ├── http://localhost:5173  ──▶  Nginx (client pod :80)
     │                                    │
     │                                    ├── serves React files
     │                                    ├── proxy /api ──────▶ Node.js :4000
     │                                    └── proxy /socket.io ▶ Node.js :4000
     │                                                │
     │                                          ┌─────┴──────┐
     │                                          ▼            ▼
     │                                     PostgreSQL      Redis
     │                                        :5432         :6379
     │                                     (messages,    (online
     │                                       users)        status)
     │
     ├── http://localhost:4000  ──▶  Node.js (direct API access)
     │
     └── http://localhost:3000  ──▶  Grafana (own Nginx, separate pod)
                                          │
                                          └── queries Prometheus :9090
```

### Port Reference

| Port | Service | Purpose | Browser? |
|---|---|---|---|
| **5173** | React + Nginx | Chat UI — main app | ✅ Yes |
| **4000** | Node.js | REST API + Socket.io | ✅ Yes |
| **3000** | Grafana | Monitoring dashboards | ✅ Yes |
| **5432** | PostgreSQL | Stores users + messages | ❌ Internal |
| **6379** | Redis | Online status + sessions | ❌ Internal |
| **9090** | Prometheus | Metrics collection | ❌ Internal |

### Important — Nginx vs Grafana

```
:5173 → Your app's Nginx (client pod)
         ├── serves React files
         ├── proxies /api to Node.js
         └── proxies /socket.io to Node.js

:3000 → Grafana's own web server (grafana pod)
         ├── serves Grafana UI
         └── completely separate from your app's Nginx
```

### What needs to be running

| Service | Command | Required for |
|---|---|---|
| **Minikube** | `minikube start` | Everything |
| **App port-forward** | `kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork` | Chat app |
| **API port-forward** | `kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork` | API calls |
| **Grafana port-forward** | `kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring` | Monitoring |
| **Actions Runner** | `cd ~/actions-runner && ./run.sh` | CI/CD on push |

### Minimum to use the app

```bash
minikube start
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork
kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork
open http://localhost:5173
```

### Full stack

```bash
# Terminal 1
minikube start

# Terminal 2 — Chat app
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork

# Terminal 3 — API
kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork

# Terminal 4 — Monitoring
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring

# Terminal 5 — CI/CD runner (only needed when pushing code)
cd ~/actions-runner && ./run.sh
```

### Browser URLs

| URL | What you see |
|---|---|
| http://localhost:5173 | Chat application |
| http://localhost:4000/api/users | All users (JSON) |
| http://localhost:3000 | Grafana monitoring |

---

## 🚀 Tech Stack

### Application
| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 19.2.0 |
| Build Tool | Vite + SWC | 7.3.1 |
| Backend | Node.js + Express | 5.2.1 |
| Real-time | Socket.io | 4.8.3 |
| Database | PostgreSQL | 15-alpine |
| Cache / Sessions | Redis (ioredis) | 7-alpine |
| Web Server | Nginx | alpine |
| Email | Nodemailer + Gmail SMTP | 8.0.2 |
| Password Hashing | bcryptjs | 3.0.3 |

### DevOps
| Tool | Purpose |
|---|---|
| Docker | Containerization |
| Docker Compose | Local multi-container orchestration |
| Kubernetes (Minikube) | Container orchestration |
| Helm | Kubernetes package manager |
| GitHub Actions | CI/CD pipeline (self-hosted runner) |
| Prometheus | Metrics collection |
| Grafana | Dashboards + Email alerts |

---

## 📁 Project Structure — Every File Explained

```
foreseesnetwork/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD — build, load, deploy
├── k8s/                            # Kubernetes manifests
│   ├── namespace.yml               # foreseesnetwork namespace
│   ├── configmap.yml               # Non-secret env variables
│   ├── secrets.yml                 # DB password, email credentials
│   ├── postgres.yml                # PostgreSQL deployment + PVC + service
│   ├── postgres-init-configmap.yml # DB schema initialization
│   ├── redis.yml                   # Redis deployment + service
│   ├── server.yml                  # Node.js deployment + service
│   ├── client.yml                  # React/Nginx deployment + service
│   ├── hpa.yml                     # Horizontal Pod Autoscaler
│   └── ingress.yml                 # Ingress controller
├── server/                         # Node.js backend
│   ├── index.js                    # Main server — Express + Socket.io
│   ├── db.js                       # PostgreSQL connection pool
│   ├── redis.js                    # Redis client (ioredis)
│   ├── mailer.js                   # OTP + password reset emails
│   ├── init.sql                    # Database schema + indexes
│   ├── Dockerfile                  # Server container image
│   └── package.json                # Backend dependencies
├── src/                            # React frontend
│   ├── App.jsx                     # Router + app entry
│   ├── ChatApp.jsx                 # Main chat interface
│   ├── Login.jsx                   # Login page
│   ├── Register.jsx                # Registration + OTP verification
│   ├── ForgotPassword.jsx          # Forgot password page
│   ├── ResetPassword.jsx           # Reset password page
│   ├── Welcome.jsx                 # Landing/welcome page
│   └── socket.js                   # Socket.io client setup
├── nginx.conf                      # Nginx reverse proxy config
├── docker-compose.yml              # Local development setup
├── Dockerfile                      # Client container image
├── grafana-values.yml              # Grafana Helm SMTP config
└── vite.config.js                  # Vite build config
```

---

## 📄 File Details

### `.github/workflows/deploy.yml`
GitHub Actions CI/CD pipeline. Triggered on every push to `main`.
- **Job 1:** Builds Docker images locally on your Mac using self-hosted runner
- **Job 2:** Loads images directly into Minikube, applies K8s manifests, waits for rollout
- **Job 3:** Sends failure notification if any job fails

**Why self-hosted runner?**
GitHub's cloud servers cannot reach `127.0.0.1` (your Minikube). Self-hosted runner runs on your Mac so it can reach Minikube directly.

**Why no GHCR?**
Images are built and loaded directly into Minikube — no registry needed for local setup. Faster pipeline, no upload/download time.

---

### `server/index.js`
Main backend server. Entry point for Node.js.
- Creates Express app and HTTP server
- Initializes Socket.io with CORS enabled, 20s ping timeout, 10s ping interval
- Manages `userSocketMap` — maps username → socket ID for direct messaging

**REST API routes:**
- `POST /api/send-otp` — validates uniqueness, sends 6-digit OTP email
- `POST /api/register` — creates user with bcrypt hashed password
- `POST /api/login` — validates credentials, returns user object
- `POST /api/forgot-password` — generates 32-byte hex token, stores with 15min expiry
- `POST /api/reset-password` — validates token, updates hashed password
- `GET /api/users` — returns all users
- `GET /api/online/:username` — checks Redis for online status
- `GET /api/messages/:user1/:user2` — paginated chat history (50 per page)
- `GET /api/recent-chats/:username` — last message per conversation

**Socket.io events:**
- `join` — adds user to room, sets Redis online key, delivers pending messages
- `logout` — removes from Redis immediately
- `heartbeat` — refreshes Redis online key every 10s
- `send_message` — saves to PostgreSQL first, then attempts live delivery with ACK
- `mark_read` — updates message status, notifies sender
- `typing` / `stop_typing` — forwards to recipient
- `disconnect` — delays offline broadcast by 8s (handles reconnects)

---

### `server/db.js`
PostgreSQL connection pool using `pg` library.
- Creates pool with env vars, falls back to localhost defaults
- Sets timezone to `Asia/Kolkata`
- Tests connection on startup

```js
host: process.env.DB_HOST || "localhost"
port: process.env.DB_PORT || 5433
database: process.env.DB_NAME || "foreseesnetwork"
user: process.env.DB_USER || "postgres"
password: process.env.DB_PASSWORD || "postgres"
```

---

### `server/redis.js`
Redis client using `ioredis` library.
- Connects using env vars
- Used for online user tracking (`online:username` keys)

```js
host: process.env.REDIS_HOST || "localhost"
port: process.env.REDIS_PORT || 6379
```

---

### `server/mailer.js`
Email service using Nodemailer + Gmail SMTP.

**How credentials work:**
`EMAIL_USER` and `EMAIL_PASS` come from `k8s/secrets.yml` — injected as env vars into the server pod automatically. No external secrets manager needed.

**Gmail App Password Setup:**
1. Go to **myaccount.google.com/security**
2. Enable **2-Step Verification**
3. Go to **App passwords** → create new → name it `ForeseesNetwork`
4. Copy 16-character password
5. Add to `k8s/secrets.yml` as `EMAIL_PASS`

**`sendOtpEmail(toEmail, otp, username)`**

Registration flow:
```
User fills Register form
      ↓
POST /api/send-otp
      ↓
Generates 6-digit OTP
      ↓
Sends styled HTML email
      ↓
User enters OTP → registration completes
```
Email: purple→pink gradient header, OTP in dark box, expires in 10 minutes

**`sendPasswordResetEmail(toEmail, resetLink, username)`**

Reset flow:
```
User enters email on Forgot Password page
      ↓
POST /api/forgot-password
      ↓
Generates 32-byte hex token, stores with 15min expiry
      ↓
Sends email with reset link
      ↓
User clicks link → POST /api/reset-password
      ↓
Token validated → password updated → token cleared
```
Email: same branded design, gradient reset button, expires in 15 minutes

---

### `server/init.sql`
PostgreSQL schema — auto-runs when PostgreSQL container starts for first time.
Creates 3 tables and 4 indexes.

---

### `server/Dockerfile`
```
node:18-alpine
  → install tzdata → ENV TZ=Asia/Kolkata
  → npm install --production
  → expose 4000 → node index.js
```

---

### `Dockerfile` (root — client)
Multi-stage build:
```
Stage 1 (builder): node:18-alpine
  → npm install → npm run build → /app/dist

Stage 2 (serve): nginx:alpine
  → copy /app/dist to /usr/share/nginx/html
  → copy nginx.conf
  → expose 80
```
Final image is tiny — only Nginx + built static files. No Node.js needed.

---

### `nginx.conf`
Nginx reverse proxy — the front door of your app.

```
location /api      → proxy to server-service:4000  (REST API)
location /socket.io → proxy to server-service:4000  (WebSocket)
location /assets   → cache 1 year (JS/CSS files)
location /         → serve React index.html
```

Key points:
- `server-service` = Kubernetes DNS name for Node.js pod
- WebSocket proxy needs `Upgrade` headers for Socket.io to work
- `try_files $uri $uri/ /index.html` handles React Router client-side routing

---

### `docker-compose.yml`
Local development with 4 services:

| Service | Image | Ports | Health Check |
|---|---|---|---|
| postgres | postgres:15-alpine | 5434:5432 | pg_isready |
| redis | redis:7-alpine | 6379:6379 | redis-cli ping |
| server | livechat-server | 4000:4000 | depends on db+redis |
| client | livechat-client | 80:80 | depends on server |

---

### `grafana-values.yml`
Helm values for Grafana SMTP configuration.
- Gmail SMTP settings
- References `grafana-smtp-secret` Kubernetes secret for password
- Applied during `helm install`

---

### `k8s/namespace.yml`
Creates `foreseesnetwork` namespace — all app resources isolated here.

---

### `k8s/configmap.yml`
Non-sensitive config as `fn-config` ConfigMap:
```
DB_HOST=postgres-service
DB_PORT=5432
DB_NAME=foreseesnetwork
DB_USER=postgres
REDIS_HOST=redis-service
REDIS_PORT=6379
PORT=4000
TZ=Asia/Kolkata
```

---

### `k8s/secrets.yml`
Sensitive credentials as `fn-secrets` Secret:
```
DB_PASSWORD
EMAIL_USER
EMAIL_PASS
```

---

### `k8s/postgres.yml`
PostgreSQL with 3 components:
- **Deployment** — postgres:15-alpine, mounts PVC + init SQL, readiness probe
- **Service** — ClusterIP :5432, DNS name `postgres-service`
- **PVC** — 1Gi storage, data survives pod restarts

---

### `k8s/postgres-init-configmap.yml`
SQL schema mounted at `/docker-entrypoint-initdb.d/` — auto-runs on first start.
Creates users, messages, message_sequences tables + 4 indexes.

---

### `k8s/redis.yml`
Redis with 2 components:
- **Deployment** — redis:7-alpine, readiness probe (`redis-cli ping`)
- **Service** — ClusterIP :6379, DNS name `redis-service`

---

### `k8s/server.yml`
Node.js backend:
- **Deployment** — livechat-server, mounts configmap + secrets
  - CPU: 100m request / 500m limit
  - Memory: 128Mi request / 512Mi limit
  - `imagePullPolicy: Never` — uses locally loaded image
  - Readiness probe: `GET /api/users`
- **Service** — ClusterIP :4000, DNS name `server-service`

---

### `k8s/client.yml`
React frontend:
- **Deployment** — livechat-client (Nginx)
  - CPU: 50m request / 300m limit
  - Memory: 64Mi request / 256Mi limit
  - `imagePullPolicy: Never` — uses locally loaded image
- **Service** — ClusterIP :80, DNS name `client-service`

---

### `k8s/hpa.yml`
Horizontal Pod Autoscaler:

| Deployment | Min | Max | CPU Trigger | Memory Trigger |
|---|---|---|---|---|
| server | 1 | 10 | 70% | 80% |
| client | 1 | 10 | 70% | 80% |

Requires: `minikube addons enable metrics-server`

---

### `k8s/ingress.yml`
Routes traffic at `foreseesnetwork.local`:
- `/api` → server-service:4000
- `/socket.io` → server-service:4000 (1hr WebSocket timeout)
- `/` → client-service:80

---

### `vite.config.js`
Vite build config using `@vitejs/plugin-react-swc` (Rust-based, fast compilation).

---

## ⚡ Application Features

### Chat Features
- ✅ Real-time messaging with Socket.io
- ✅ Message delivery acknowledgment (sent → delivered → read)
- ✅ Offline message queuing — delivered when user reconnects
- ✅ Typing indicators
- ✅ Online/offline user status
- ✅ Recent chats list
- ✅ Chat history with pagination (50 per page)
- ✅ Message sequence numbers per conversation

### Auth Features
- ✅ Registration with OTP email verification
- ✅ Login with bcrypt hashed password
- ✅ Forgot password via email reset link (15-minute expiry)
- ✅ Auto-generated avatar (first letter of username)

### DevOps Features
- ✅ Multi-stage Docker builds
- ✅ Kubernetes with auto-restart
- ✅ Horizontal Pod Autoscaling (1–10 pods)
- ✅ CI/CD — auto deploy on every git push
- ✅ Email credentials via Kubernetes secrets
- ✅ Prometheus + Grafana monitoring
- ✅ Email alerts for pod crashes, high CPU, high memory

---

## 🗄️ Database Schema

### users
| Column | Type | Description |
|---|---|---|
| id | SERIAL PRIMARY KEY | Auto-increment |
| username | VARCHAR(22) UNIQUE | Max 22 chars |
| email | VARCHAR(255) UNIQUE | Case-insensitive lookup |
| password | VARCHAR(255) | bcrypt hashed |
| avatar | VARCHAR(5) | First letter uppercase |
| created_at | TIMESTAMP | Default NOW() |
| reset_token | VARCHAR(255) | 32-byte hex token |
| reset_expires | TIMESTAMP | NOW() + 15 minutes |

### messages
| Column | Type | Description |
|---|---|---|
| id | SERIAL PRIMARY KEY | Auto-increment |
| from_user | VARCHAR(22) | Sender username |
| to_user | VARCHAR(22) | Recipient username |
| text | TEXT | Message content |
| time | VARCHAR(10) | Display time HH:MM |
| created_at | TIMESTAMP | Server timestamp |
| status | VARCHAR(10) | sent / delivered / read |
| seq_num | INTEGER | Per-conversation sequence |
| acked | BOOLEAN | Delivery ACK flag |

### message_sequences
| Column | Type | Description |
|---|---|---|
| user_pair | VARCHAR(50) PRIMARY KEY | e.g. "alice_bob" (sorted) |
| last_seq | INTEGER | Last used sequence number |

### Indexes
```sql
idx_messages_users   ON messages (from_user, to_user)
idx_messages_created ON messages (created_at)
idx_messages_seq     ON messages (from_user, to_user, seq_num)
idx_messages_unacked ON messages (to_user, acked) WHERE acked = FALSE
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/send-otp` | `{ email, username }` | `{ message, otp }` |
| POST | `/api/register` | `{ username, email, password }` | `{ user }` |
| POST | `/api/login` | `{ email, password }` | `{ user }` |
| POST | `/api/forgot-password` | `{ email }` | `{ message }` |
| POST | `/api/reset-password` | `{ token, password }` | `{ message }` |

### Users & Messages
| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/users` | `{ users: [...] }` |
| GET | `/api/online/:username` | `{ online: true/false }` |
| GET | `/api/messages/:user1/:user2?offset=0` | `{ messages, hasMore }` |
| GET | `/api/recent-chats/:username` | `{ chats: [...] }` |

---

## 📡 Socket.io Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join` | `username` | Come online, deliver pending messages |
| `logout` | `username` | Go offline immediately |
| `heartbeat` | — | Keep-alive every 10s |
| `send_message` | `{ from, to, text, time }` | Send message with ACK |
| `mark_read` | `{ from, to }` | Mark messages as read |
| `typing` | `{ from, to }` | Started typing |
| `stop_typing` | `{ from, to }` | Stopped typing |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `user_online` | `username` | User came online |
| `user_offline` | `username` | User went offline (8s delay) |
| `online_list` | `[usernames]` | All online users on join |
| `receive_message` | `message` | New message with ACK |
| `message_delivered` | `{ id, seq_num }` | Delivery confirmed |
| `messages_read` | `{ by: username }` | Read receipt |
| `typing` | `{ from }` | Typing indicator |
| `stop_typing` | `{ from }` | Stopped typing |

---

## 🌍 Environment Variables

### Backend
| Variable | Source | Description |
|---|---|---|
| `PORT` | configmap | Server port (4000) |
| `DB_HOST` | configmap | postgres-service |
| `DB_PORT` | configmap | 5432 |
| `DB_NAME` | configmap | foreseesnetwork |
| `DB_USER` | configmap | postgres |
| `DB_PASSWORD` | secret | PostgreSQL password |
| `REDIS_HOST` | configmap | redis-service |
| `REDIS_PORT` | configmap | 6379 |
| `EMAIL_USER` | secret | Gmail address |
| `EMAIL_PASS` | secret | Gmail app password |
| `TZ` | configmap | Asia/Kolkata |

---

## 🐳 Docker

### Run locally with Docker Compose
```bash
docker-compose up
```
Open: `http://localhost`

### Build images manually
```bash
docker build -t livechat-server:latest ./server
docker build -t livechat-client:latest .
```

### Load into Minikube manually
```bash
minikube image load livechat-server:latest
minikube image load livechat-client:latest
```

---

## ☸️ Kubernetes Resources

### Resource Limits
| Deployment | CPU Request | CPU Limit | Mem Request | Mem Limit |
|---|---|---|---|---|
| server | 100m | 500m | 128Mi | 512Mi |
| client | 50m | 300m | 64Mi | 256Mi |

### HPA
| Deployment | Min | Max | CPU | Memory |
|---|---|---|---|---|
| server | 1 | 10 | 70% | 80% |
| client | 1 | 10 | 70% | 80% |

---

## 🔄 CI/CD Pipeline

### How the Self-Hosted Runner Works

GitHub cannot reach your Mac directly. The runner opens a persistent outgoing connection to GitHub and pulls jobs:

```
Your Mac                        GitHub Cloud
────────────────                ──────────────
./run.sh starts
    └──── opens connection ─────▶ GitHub
                                      │ (waiting...)
git push ───────────────────────────▶ GitHub receives code
                                      │ "Job ready!"
    ◀──── sends job instructions ─────┘
    │
    ├── builds Docker images (on Mac)
    ├── loads images into Minikube
    ├── kubectl apply (on Mac)
    │        └──▶ Minikube on same Mac ✅
    └──── sends result ──────────────▶ GitHub ✅
```

### Why No GHCR?

Images are built and loaded directly into Minikube — no registry needed:

```
Before (with GHCR):  Build → Push to GHCR → Pull from GHCR → Deploy (~8 min)
After (no GHCR):     Build → Load into Minikube → Deploy (~4 min)
```

When migrating to AWS (Phase 6) — add GHCR or ECR back. Cloud K8s needs a registry since it can't access local images.

### Pipeline Steps

```
git push to main
      ↓
JOB 1 — Build Docker Images (~3 min)
├── docker build livechat-server:latest
└── docker build livechat-client:latest

      ↓
JOB 2 — Deploy to Kubernetes (~1 min)
├── minikube image load livechat-server:latest
├── minikube image load livechat-client:latest
├── kubectl apply -f k8s/
├── kubectl rollout status deployment/server
└── kubectl rollout status deployment/client

      ↓
JOB 3 — Notify on Failure
└── Echo failure details
```

### GitHub Secrets Required
| Secret | Command |
|---|---|
| `MINIKUBE_CA_CRT` | `cat ~/.minikube/ca.crt \| base64 \| tr -d '\n'` |
| `MINIKUBE_CLIENT_CRT` | `cat ~/.minikube/profiles/minikube/client.crt \| base64 \| tr -d '\n'` |
| `MINIKUBE_CLIENT_KEY` | `cat ~/.minikube/profiles/minikube/client.key \| base64 \| tr -d '\n'` |

### Skip CI/CD for small changes
```bash
git commit -m "your message [skip ci]"
```

---

## 📊 Monitoring

### Stack
| Component | Purpose | Namespace |
|---|---|---|
| Prometheus | Scrapes metrics every 15s | monitoring |
| Grafana | Dashboards + email alerts | monitoring |
| AlertManager | Routes alerts to contact points | monitoring |
| Node Exporter | Host machine metrics | monitoring |
| kube-state-metrics | Kubernetes object metrics | monitoring |

### Install
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f grafana-values.yml
```

### SMTP Setup
Gmail app password stored as Kubernetes secret:
```bash
kubectl create secret generic grafana-smtp-secret \
  --from-literal=smtp-password=YOUR_GMAIL_APP_PASSWORD \
  -n monitoring
```

### Access Grafana
```bash
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```
Open: `http://localhost:3000`

Get password:
```bash
kubectl get secret monitoring-grafana -n monitoring \
  -o jsonpath='{.data.admin-password}' | base64 -d
```

### Dashboards
| Dashboard | Shows |
|---|---|
| Kubernetes / Compute Resources / Namespace (Pods) | CPU + memory per pod |
| Kubernetes / Compute Resources / Namespace (Workloads) | Per deployment |
| Node Exporter / Nodes | Host machine health |

### Alert Rules
| Alert | Condition | Notification |
|---|---|---|
| High CPU Usage | CPU > 80% | Email |
| Pod Restarted | Restart count > 0 | Email |
| High Memory Usage | Memory > 400MB | Email |

### Alert States
| State | Meaning |
|---|---|
| 🟢 Normal | Everything healthy |
| 🟡 Pending | Threshold breached, waiting |
| 🔴 Firing | Alert active, email sent |
| ✅ Resolved | Problem fixed, recovery email sent |

### Test alerts
```bash
# Simulate pod crash → triggers Pod Restarted alert
kubectl delete pod -l app=server -n foreseesnetwork
```

---

## 📋 Useful Commands

```bash
# Pod status
kubectl get pods -n foreseesnetwork

# Logs
kubectl logs deployment/server -n foreseesnetwork
kubectl logs deployment/client -n foreseesnetwork

# Restart deployment
kubectl rollout restart deployment/server -n foreseesnetwork

# HPA status
kubectl get hpa -n foreseesnetwork

# Resource usage
kubectl top pods -n foreseesnetwork

# DB access
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork

# List users
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork -c "SELECT * FROM users;"

# PVC status
kubectl get pvc -n foreseesnetwork

# Retrigger CI/CD
git commit --allow-empty -m "ci: retrigger" && git push

# Stop everything
minikube stop
```

---

## 🗺️ Roadmap

- [ ] Phase 6 — Migrate to AWS (EKS + ECR + RDS + ElastiCache)
- [ ] Phase 7 — Staging + Production environments
- [ ] VPA for PostgreSQL and Redis
- [ ] ELK stack for centralized logging
- [ ] SSL/HTTPS with cert-manager
- [ ] Rate limiting in Nginx
- [ ] Group chat support
- [ ] File/image sharing
- [ ] Message reactions

---

## 👤 Author

**Nivash** (iKryptonian)
- GitHub: [@ikryptonian](https://github.com/ikryptonian)
- Repo: [github.com/ikryptonian/foreseesnetwork](https://github.com/ikryptonian/foreseesnetwork)
