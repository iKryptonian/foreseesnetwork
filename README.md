# ForeseesNetwork — Kubernetes-Orchestrated Cloud-Native App with CI/CD and Observability(Real-Time Chat App)

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

## 📋 Full Workflow — Step by Step

### Start Everything
```bash
# Step 1 — Start Minikube cluster
minikube start

# Step 2 — Port forward chat app (keep open)
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork &

# Step 3 — Port forward Grafana (optional, keep open)
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &

# Step 4 — Start CI/CD runner (only needed when pushing code)
cd ~/actions-runner && ./run.sh
```

### Open in Browser
```
http://localhost:5173  → Chat app
http://localhost:3000  → Grafana monitoring
```

### Push Code (auto deploys)
```bash
cd ~/livechat
git add .
git commit -m "your message"
git push
# Actions runner picks it up → builds images → deploys to K8s automatically
```

### Stop Everything
```bash
pkill -f "kubectl port-forward"   # kill all port-forwards
minikube stop                      # stop cluster
```

---

## 🚀 Quickstart

### Option 1 — Docker Compose (local dev)
```bash
cd ~/livechat
docker-compose up          # foreground
docker-compose up -d       # background
docker-compose down        # stop
docker-compose up --build  # rebuild images
docker-compose logs -f fn_server  # view server logs
```
Open: **http://localhost**

### Option 2 — Kubernetes (full stack)
```bash
# Terminal 1
minikube start

# Terminal 2 — Chat app
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork

# Terminal 3 — CI/CD runner (only when pushing code)
cd ~/actions-runner && ./run.sh
```
Open: **http://localhost:5173**

---

## 🌐 How Everything Connects

```
Browser → Nginx (port 80 or 5173)
              ├── /          → serves React files
              ├── /api       → proxies to Node.js:4000 (internal)
              └── /socket.io → proxies to Node.js:4000 (internal)
                                    │
                              ┌─────┴──────┐
                              ▼            ▼
                         PostgreSQL      Redis
                            :5432         :6379
```

> Port 4000 is **internal only** — nginx proxies to it. All frontend API calls use relative URLs (/api/...) — works on any domain: localhost, ngrok, Railway, AWS.

### Port Reference

| Port | Service | Purpose | Browser? |
|---|---|---|---|
| **80** | Nginx (Docker) | Chat UI via Docker Compose | ✅ Yes |
| **5173** | Nginx (K8s) | Chat UI via Minikube | ✅ Yes |
| **4000** | Node.js | Internal API + Socket.io | ❌ Internal only |
| **3000** | Grafana | Monitoring dashboards | ✅ Yes |
| **5432** | PostgreSQL | Stores users + messages | ❌ Internal |
| **6379** | Redis | Online status + sessions | ❌ Internal |
| **9090** | Prometheus | Metrics collection | ❌ Internal |

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

## 📁 Project Structure

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
│   ├── postgres-init-configmap.yml # DB schema (all tables auto-created)
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
│   ├── init.sql                    # Database schema (6 tables + indexes)
│   ├── Dockerfile                  # Server container image
│   └── package.json                # Backend dependencies
├── src/                            # React frontend
│   ├── App.jsx                     # Router + app entry
│   ├── ChatApp.jsx                 # Main chat (1-on-1 + groups + reactions)
│   ├── Login.jsx                   # Login page
│   ├── Register.jsx                # Registration + OTP verification
│   ├── ForgotPassword.jsx          # Forgot password page
│   ├── ResetPassword.jsx           # Reset password page
│   ├── Welcome.jsx                 # Landing/welcome page
│   └── socket.js                   # Socket.io client (connects via nginx "/")
├── nginx.conf                      # Nginx reverse proxy config
├── docker-compose.yml              # Local development setup
├── Dockerfile                      # Client container image
├── grafana-values.yml              # Grafana Helm SMTP config
├── start.sh                        # Start everything (minikube + port-forwards)
├── stop.sh                         # Stop everything
└── vite.config.js                  # Vite build config
```

---

## ⚡ Application Features

### 1-on-1 Chat
- ✅ Real-time messaging with Socket.io
- ✅ Message delivery acknowledgment (sent → delivered → read)
- ✅ Offline message queuing — delivered when user reconnects
- ✅ Typing indicators
- ✅ Online/offline user status
- ✅ Recent chats list
- ✅ Chat history with pagination (50 per page)
- ✅ Message reactions (long press → emoji picker, one reaction per person)
- ✅ Reply to message (↩ in action menu → quoted preview in bubble)
- ✅ Click reply preview → scrolls to original message with flash highlight
- ✅ Edit message (✏️ in action menu → inline edit → Enter to save)
- ✅ Delete message (🗑️ in action menu → "This message was deleted")
- ✅ Copy blocked (cannot copy chat content)

### Group Chat
- ✅ Create groups with multiple members
- ✅ Creator automatically becomes admin
- ✅ Admin can promote members to admin
- ✅ Creator can demote other admins to member
- ✅ Admin can remove members from group
- ✅ Any member (except creator) can leave group
- ✅ Admin can add new members to existing group
- ✅ Real-time group messaging
- ✅ Group typing indicators
- ✅ Members panel with roles (👑 Admin / Member)
- ✅ Message reactions, reply, edit, delete (same as 1-on-1)

### Auth
- ✅ Registration with OTP email verification
- ✅ Login with bcrypt hashed password
- ✅ Forgot password via email reset link (15-minute expiry)
- ✅ Auto-generated avatar (first letter of username)

### DevOps
- ✅ Multi-stage Docker builds
- ✅ Kubernetes with auto-restart
- ✅ Horizontal Pod Autoscaling (1–10 pods)
- ✅ CI/CD — auto deploy on every git push
- ✅ Force removes stale images before every deploy
- ✅ Prometheus + Grafana monitoring
- ✅ Email alerts for pod crashes, high CPU, high memory
- ✅ Relative URLs — works with ngrok, Railway, any domain

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
| reactions | JSONB | e.g. { "❤️": ["user1"] } |
| edited | BOOLEAN | Whether message was edited |
| deleted | BOOLEAN | Whether message was deleted |
| reply_to | JSONB | { id, text, from_user } of quoted message |

### message_sequences
| Column | Type | Description |
|---|---|---|
| user_pair | VARCHAR(50) PRIMARY KEY | e.g. "alice_bob" (sorted) |
| last_seq | INTEGER | Last used sequence number |

### groups
| Column | Type | Description |
|---|---|---|
| id | SERIAL PRIMARY KEY | Auto-increment |
| name | VARCHAR(100) | Group name |
| created_by | VARCHAR(22) | Creator username (permanent admin) |
| avatar | VARCHAR(5) | First letter uppercase |
| created_at | TIMESTAMP | Default NOW() |

### group_members
| Column | Type | Description |
|---|---|---|
| group_id | INTEGER | References groups(id) CASCADE |
| username | VARCHAR(22) | Member username |
| role | VARCHAR(10) | 'admin' or 'member' |
| joined_at | TIMESTAMP | When they joined |

### group_messages
| Column | Type | Description |
|---|---|---|
| id | SERIAL PRIMARY KEY | Auto-increment |
| group_id | INTEGER | References groups(id) CASCADE |
| from_user | VARCHAR(22) | Sender username |
| text | TEXT | Message content |
| time | VARCHAR(10) | Display time HH:MM |
| created_at | TIMESTAMP | Server timestamp |
| status | VARCHAR(10) | sent |
| reactions | JSONB | e.g. { "😂": ["user1"] } |
| edited | BOOLEAN | Whether message was edited |
| deleted | BOOLEAN | Whether message was deleted |
| reply_to | JSONB | { id, text, from_user } of quoted message |

### Indexes
```sql
idx_messages_users        ON messages (from_user, to_user)
idx_messages_created      ON messages (created_at)
idx_messages_seq          ON messages (from_user, to_user, seq_num)
idx_messages_unacked      ON messages (to_user, acked) WHERE acked = FALSE
idx_group_messages_group  ON group_messages (group_id)
idx_group_members_user    ON group_members (username)
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

### Groups
| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/groups` | `{ name, createdBy, members }` | `{ group }` |
| GET | `/api/groups/user/:username` | — | `{ groups: [...] }` |
| GET | `/api/groups/:groupId/members` | — | `{ members: [...] }` |
| GET | `/api/groups/:groupId/messages?offset=0` | — | `{ messages, hasMore }` |

---

## 📡 Socket.io Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join` | `username` | Come online, join group rooms |
| `logout` | `username` | Go offline immediately |
| `heartbeat` | — | Keep-alive every 5s |
| `send_message` | `{ from, to, text, time, replyTo }` | 1-on-1 message with ACK |
| `mark_read` | `{ from, to }` | Mark messages as read |
| `typing` | `{ from, to }` | Started typing |
| `stop_typing` | `{ from, to }` | Stopped typing |
| `send_group_message` | `{ groupId, from, text, time, replyTo }` | Group message |
| `make_admin` | `{ groupId, targetUser, requestedBy }` | Promote to admin |
| `demote_admin` | `{ groupId, targetUser, requestedBy }` | Demote to member |
| `remove_member` | `{ groupId, targetUser, requestedBy }` | Remove from group |
| `leave_group` | `{ groupId, username }` | Leave group |
| `add_members` | `{ groupId, newMembers, requestedBy }` | Add new members |
| `group_typing` | `{ from, groupId }` | Group typing |
| `group_stop_typing` | `{ from, groupId }` | Group stop typing |
| `add_reaction` | `{ messageId, emoji, username, isGroup, groupId }` | React to message |
| `edit_message` | `{ messageId, newText, username, isGroup, groupId }` | Edit own message |
| `delete_message` | `{ messageId, username, isGroup, groupId }` | Delete own message |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `user_online` | `username` | User came online |
| `user_offline` | `username` | User went offline (8s delay) |
| `online_list` | `[usernames]` | All online users on join |
| `receive_message` | `message` | New 1-on-1 message with ACK |
| `message_delivered` | `{ id, seq_num }` | Delivery confirmed |
| `messages_read` | `{ by: username }` | Read receipt |
| `receive_group_message` | `message` | New group message |
| `group_created` | `group` | Group created |
| `group_role_updated` | `{ groupId, username, role }` | Role changed |
| `member_removed` | `{ groupId, username }` | Member removed |
| `removed_from_group` | `{ groupId }` | You were removed |
| `left_group` | `{ groupId }` | You left |
| `member_left` | `{ groupId, username }` | Someone left |
| `members_added` | `{ groupId, allMembers }` | New members added |
| `reaction_updated` | `{ messageId, reactions, isGroup }` | Reaction changed |
| `message_edited` | `{ messageId, newText, isGroup }` | Message was edited |
| `message_deleted` | `{ messageId, isGroup }` | Message was deleted |
| `group_error` | `{ message }` | Permission error |

---

## 🌍 Environment Variables

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
| `EMAIL_PASS` | secret | Gmail app password (16-char) |
| `TZ` | configmap | Asia/Kolkata |

---

## 🐳 Docker

```bash
cd ~/livechat
docker-compose up          # start
docker-compose up -d       # background
docker-compose down        # stop
docker-compose up --build  # rebuild

# Build manually
docker build -t livechat-server:latest ./server
docker build -t livechat-client:latest .

# Load into Minikube manually
minikube ssh "docker rmi livechat-server:latest -f" || true
minikube ssh "docker rmi livechat-client:latest -f" || true
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
    ├── builds Docker images --no-cache
    ├── force removes old images from Minikube
    ├── loads fresh images into Minikube
    ├── kubectl apply -f k8s/
    ├── kubectl rollout restart
    └──── sends result ──────────────▶ GitHub ✅
```

### GitHub Secrets Required

No GitHub secrets needed for Minikube certificate authentication. Certs are embedded automatically via `minikube update-context` in the deploy script.

The only credentials needed are in `k8s/secrets.yml`:
```yaml
DB_PASSWORD: "postgres"
EMAIL_USER:  "your@gmail.com"
EMAIL_PASS:  "your-16-char-app-password"
```

### Pipeline Steps

```
git push to main
      ↓
JOB 1 — Build Docker Images (~3 min)
├── docker build --no-cache livechat-server:latest
└── docker build --no-cache livechat-client:latest

      ↓
JOB 2 — Deploy to Kubernetes (~2 min)
├── minikube update-context (auto-fix kubeconfig + embed certs)
├── minikube ssh docker rmi (force remove old images)
├── minikube image load (fresh images)
├── kubectl apply -f k8s/
├── kubectl rollout restart
└── kubectl rollout status (wait for healthy pods)

      ↓
JOB 3 — Notify on Failure
```

### Useful CI/CD Commands
```bash
# Skip CI/CD for this commit
git commit -m "message [skip ci]"

# Retrigger CI/CD without code change
git commit --allow-empty -m "ci: retrigger" && git push

# Start actions runner (keep open when pushing code)
cd ~/actions-runner && ./run.sh
```

---

## 📊 Monitoring — Prometheus + Grafana

### Monitoring Stack

| Component | Purpose | Namespace |
|---|---|---|
| Prometheus | Scrapes metrics every 15s | monitoring |
| Grafana | Dashboards + email alerts | monitoring |
| AlertManager | Routes alerts to contact points | monitoring |
| Node Exporter | Host machine metrics | monitoring |
| kube-state-metrics | Kubernetes object metrics | monitoring |

---

### First Time Setup (after fresh Minikube or minikube delete)

**Step 1 — Add Helm repo:**
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

**Step 2 — Create monitoring namespace:**
```bash
kubectl create namespace monitoring
```

**Step 3 — Create secrets (SMTP + admin password):**
```bash
kubectl create secret generic grafana-secrets \
  --from-literal=admin-password=YourPermanentPassword123 \
  --from-literal=smtp-password=YOUR_GMAIL_APP_PASSWORD \
  -n monitoring
```
> Gmail app password = the 16-char app password from myaccount.google.com/security

**Step 4 — Make sure grafana-values.yml looks like this:**
```yaml
grafana:
  adminPassword: "YourPermanentPassword123"
  assertNoLeakedSecrets: false
  grafana.ini:
    smtp:
      enabled: true
      host: smtp.gmail.com:587
      user: your@gmail.com
      password: your-16-char-app-password
      from_address: your@gmail.com
      from_name: ForeseesNetwork Alerts
      startTLS_policy: MandatoryStartTLS
    analytics:
      check_for_updates: true
    log:
      mode: console
    paths:
      data: /var/lib/grafana/
      logs: /var/log/grafana
      plugins: /var/lib/grafana/plugins
      provisioning: /etc/grafana/provisioning
```
> `assertNoLeakedSecrets: false` is required — newer chart versions block plain text passwords without it

**Step 5 — Install full monitoring stack:**
```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f ~/livechat/grafana-values.yml
```

**Step 6 — Wait for all pods to be Running:**
```bash
kubectl get pods -n monitoring -w
```

All pods should show `Running`:
```
alertmanager-monitoring-kube-prometheus-alertmanager-0   2/2 Running
monitoring-grafana-xxx                                   3/3 Running
monitoring-kube-prometheus-operator-xxx                  1/1 Running
monitoring-kube-state-metrics-xxx                        1/1 Running
monitoring-prometheus-node-exporter-xxx                  1/1 Running
prometheus-monitoring-kube-prometheus-prometheus-0       2/2 Running
```

**Step 7 — Access Grafana:**
```bash
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```
Open: **http://localhost:3000**
Login: username `admin`, password `YourPermanentPassword123`

> If you forgot the password or it changed after upgrade:
> ```bash
> kubectl get secret monitoring-grafana -n monitoring \
>   -o jsonpath='{.data.admin-password}' | base64 -d
> ```

---

### If You Already Have Monitoring Installed (upgrade)

If monitoring is already installed and you changed `grafana-values.yml`:
```bash
helm upgrade monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  -f ~/livechat/grafana-values.yml
```

If secret already exists and you need to recreate it:
```bash
kubectl delete secret grafana-secrets -n monitoring
kubectl create secret generic grafana-secrets \
  --from-literal=admin-password=YourPermanentPassword123 \
  --from-literal=smtp-password=YOUR_GMAIL_APP_PASSWORD \
  -n monitoring
```

---

### Setting Up Email Alerts in Grafana

After logging into **http://localhost:3000**:

#### Step 1 — Create Contact Point
1. Go to **Alerting → Contact points**
2. Click **+ Add contact point**
3. Fill in:
   - **Name:** `email-alerts`
   - **Integration:** Email
   - **Addresses:** your@gmail.com
4. Click **Test** → verify email arrives in inbox
5. Click **Save contact point**

#### Step 2 — Set Default Notification Policy
1. Go to **Alerting → Notification policies**
2. Click **⋮ → Edit** on the Default policy
3. Set **Default contact point** → `email-alerts`
4. Click **Update default policy**

#### Step 3 — Create Alert Rules

Go to **Alerting → Alert rules → + New alert rule** for each alert below.

For all 3 alerts use these common settings:
- **Section 3 Folder:** `foreseesnetwork` (create new if first time)
- **Section 4 Evaluation group:** `foreseesnetwork-alerts` (create new if first time, interval `1m`)
- **Section 5 Contact point:** `email-alerts`

---

**Alert 1 — Pod Restarted:**

| Field | Value |
|---|---|
| Name | `Pod Restarted` |
| Datasource | Prometheus |
| Query | `increase(kube_pod_container_status_restarts_total{namespace="foreseesnetwork"}[1h])` |
| Condition | IS ABOVE `0` |
| Pending period | `None` (fires immediately) |
| Summary | `Pod {{ $labels.pod }} has restarted in foreseesnetwork` |
| Description | `A pod in the foreseesnetwork namespace has restarted. Check logs immediately.` |

---

**Alert 2 — High CPU Usage:**

| Field | Value |
|---|---|
| Name | `High CPU Usage` |
| Datasource | Prometheus |
| Query | `sum(rate(container_cpu_usage_seconds_total{namespace="foreseesnetwork"}[5m])) by (pod)` |
| Condition | IS ABOVE `0.8` |
| Pending period | `2m` |
| Summary | `Pod {{ $labels.pod }} CPU usage is above 80%` |
| Description | `CPU usage has been above 80% for 2 minutes in foreseesnetwork. Consider scaling up.` |

---

**Alert 3 — High Memory Usage:**

| Field | Value |
|---|---|
| Name | `High Memory Usage` |
| Datasource | Prometheus |
| Query | `sum(container_memory_usage_bytes{namespace="foreseesnetwork"}) by (pod)` |
| Condition | IS ABOVE `400000000` |
| Pending period | `2m` |
| Summary | `Pod {{ $labels.pod }} memory usage is above 400MB` |
| Description | `Memory usage has been above 400MB for 2 minutes in foreseesnetwork. Consider increasing memory limits.` |

---

#### Step 4 — Test Alerts
```bash
# Crash a pod → triggers Pod Restarted alert → email arrives in ~1 min
kubectl delete pod -l app=server -n foreseesnetwork
```

Check **Alerting → Alert rules** — Pod Restarted turns 🔴 Firing → email arrives in Gmail.

---

### Alert States

| State | Meaning |
|---|---|
| 🟢 Normal | Everything healthy |
| 🟡 Pending | Threshold breached, waiting to confirm |
| 🔴 Firing | Alert active, email sent |
| ✅ Resolved | Problem fixed, recovery email sent |

---

### Useful Dashboards
| Dashboard | Shows |
|---|---|
| Kubernetes / Compute Resources / Namespace (Pods) | CPU + memory per pod |
| Kubernetes / Compute Resources / Namespace (Workloads) | Per deployment |
| Node Exporter / Nodes | Host machine health |

---

### Reinstall Monitoring (if needed after minikube delete)
```bash
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring
kubectl delete secret grafana-secrets -n monitoring
# Then follow First Time Setup steps above from Step 1
```

---

## 📋 Useful Commands

```bash
# ── App ──
kubectl get pods -n foreseesnetwork -w
kubectl logs -l app=server -n foreseesnetwork -f
kubectl logs -l app=client -n foreseesnetwork -f
kubectl rollout restart deployment/server -n foreseesnetwork
kubectl rollout restart deployment/client -n foreseesnetwork
kubectl get hpa -n foreseesnetwork
kubectl top pods -n foreseesnetwork

# ── Port Forwards ──
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork &
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &
pkill -f "kubectl port-forward"  # kill all port-forwards

# ── Database ──
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork

# List all tables
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork -c "\dt"

# View users
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork -c "SELECT * FROM users;"

# Add all new columns to existing DB (run once if upgrading)
kubectl exec -it deployment/postgres -n foreseesnetwork -- psql -U postgres -d foreseesnetwork -c "
CREATE TABLE IF NOT EXISTS groups (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, created_by VARCHAR(22) NOT NULL, avatar VARCHAR(5), created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS group_members (group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE, username VARCHAR(22) NOT NULL, role VARCHAR(10) DEFAULT 'member', joined_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (group_id, username));
CREATE TABLE IF NOT EXISTS group_messages (id SERIAL PRIMARY KEY, group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE, from_user VARCHAR(22) NOT NULL, text TEXT NOT NULL, time VARCHAR(10), created_at TIMESTAMP DEFAULT NOW(), status VARCHAR(10) DEFAULT 'sent', reactions JSONB DEFAULT '{}', edited BOOLEAN DEFAULT FALSE, deleted BOOLEAN DEFAULT FALSE, reply_to JSONB DEFAULT NULL);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;
"

# ── Minikube ──
minikube start
minikube stop
minikube status
minikube update-context   # fix kubeconfig after restart
minikube delete           # wipe everything (data lost!)

# ── CI/CD ──
git commit --allow-empty -m "ci: retrigger" && git push
git commit -m "message [skip ci]"
```

---

## 👤 Author

**Nivash** (iKryptonian)
- GitHub: [@ikryptonian](https://github.com/ikryptonian)
- Repo: [github.com/ikryptonian/foreseesnetwork](https://github.com/ikryptonian/foreseesnetwork)
