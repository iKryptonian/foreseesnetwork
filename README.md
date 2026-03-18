# ForeseesNetwork — Cloud-Native Real-Time Chat Platform

A production-grade real-time chat application built with a complete DevOps pipeline — containerized, orchestrated, auto-scaled, continuously deployed, and monitored.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                     │
│   git push → Build Docker → Push GHCR → Deploy K8s          │
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
│           Terraform + LocalStack (AWS Simulation)           │
│   S3 Bucket (Backups) │ SSM Parameters │ IAM User/Policy    │
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
     ├── http://localhost:5173  ──▶  React App (Nginx in K8s)
     │                                    │
     │                                    │ proxy /api →
     │                                    │ proxy /socket.io →
     │                                    ▼
     ├── http://localhost:4000  ──▶  Node.js API + Socket.io
     │                                    │
     │                              ┌─────┴──────┐
     │                              ▼            ▼
     │                         PostgreSQL      Redis
     │                         :5432           :6379
     │                         (messages,      (online
     │                          users)          status)
     │
     ├── http://localhost:3000  ──▶  Grafana Dashboard
     │
     └── http://localhost:4566  ──▶  LocalStack (AWS simulation)
                                          │
                                    ┌─────┴──────┐
                                    ▼            ▼
                                S3 Bucket    SSM Params
                               (DB backups) (secrets)
```

### Port Reference

| Port | Service | Purpose | Browser? |
|---|---|---|---|
| **5173** | React App | Chat UI | ✅ Main app |
| **4000** | Node.js API | REST API + Socket.io | ✅ API calls |
| **3000** | Grafana | Monitoring dashboards | ✅ Monitoring |
| **5432** | PostgreSQL | Database | ❌ Internal only |
| **6379** | Redis | Cache/sessions | ❌ Internal only |
| **4566** | LocalStack | Fake AWS | ❌ Internal only |

### What needs to be running

| Service | Command | Required for |
|---|---|---|
| **Minikube** | `minikube start` | Everything |
| **LocalStack** | `localstack start -d` | SSM secrets, S3 backups |
| **Actions Runner** | `cd ~/actions-runner && ./run.sh` | CI/CD on push |
| **App port-forward** | `kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork` | Accessing the app |
| **API port-forward** | `kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork` | API calls |
| **Grafana port-forward** | `kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring` | Monitoring |

### Minimum to just use the app

```bash
# 1. Start Minikube
minikube start

# 2. Forward app port
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork

# 3. Forward API port
kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork

# 4. Open browser
open http://localhost:5173
```

### Full stack (everything running)

```bash
# Terminal 1 — Kubernetes
minikube start

# Terminal 2 — LocalStack (AWS)
localstack start -d

# Terminal 3 — CI/CD Runner
cd ~/actions-runner && ./run.sh

# Terminal 4 — App
kubectl port-forward svc/client-service 5173:80 -n foreseesnetwork

# Terminal 5 — API
kubectl port-forward svc/server-service 4000:4000 -n foreseesnetwork

# Terminal 6 — Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
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
| AWS SDK | @aws-sdk/client-s3, @aws-sdk/client-ssm | 3.x |

### DevOps
| Tool | Purpose |
|---|---|
| Docker | Containerization |
| Docker Compose | Local multi-container orchestration |
| Kubernetes (Minikube) | Container orchestration |
| Helm | Kubernetes package manager |
| Terraform | Infrastructure as Code |
| LocalStack | AWS simulation (S3, SSM, IAM) |
| GitHub Actions | CI/CD pipeline |
| GHCR | Docker image registry |
| Prometheus | Metrics collection |
| Grafana | Dashboards + Email alerts |

---

## 📁 Project Structure — Every File Explained

```
foreseesnetwork/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── k8s/
│   ├── namespace.yml
│   ├── configmap.yml
│   ├── secrets.yml
│   ├── postgres.yml
│   ├── postgres-init-configmap.yml
│   ├── redis.yml
│   ├── server.yml
│   ├── client.yml
│   ├── hpa.yml
│   └── ingress.yml
├── server/
│   ├── index.js
│   ├── db.js
│   ├── redis.js
│   ├── aws.js
│   ├── backup.js
│   ├── mailer.js
│   ├── init.sql
│   ├── Dockerfile
│   └── package.json
├── src/
│   ├── App.jsx
│   ├── ChatApp.jsx
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── ForgotPassword.jsx
│   ├── ResetPassword.jsx
│   ├── Welcome.jsx
│   └── socket.js
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── nginx.conf
├── docker-compose.yml
├── Dockerfile
├── grafana-values.yml
└── vite.config.js
```

---

## 📄 File Details

### `.github/workflows/deploy.yml`
GitHub Actions CI/CD pipeline. Triggered on every push to `main`.
- **Job 1:** Builds and pushes Docker images to GHCR with SHA tag
- **Job 2:** Updates K8s manifests with new image tags and deploys to Minikube
- **Job 3:** Sends failure notification if any job fails
- Uses self-hosted runner because Minikube runs locally

---

### `server/index.js`
Main backend server file. Entry point for Node.js.
- Creates Express app and HTTP server
- Initializes Socket.io with CORS enabled, 20s ping timeout, 10s ping interval
- On startup: fetches `EMAIL_USER` and `EMAIL_PASS` from AWS SSM Parameters
- Schedules nightly DB backup at midnight IST using `setTimeout` + `setInterval`
- Manages `userSocketMap` — maps username → socket ID for direct messaging

**REST API routes defined here:**
- `POST /api/send-otp` — validates email/username uniqueness, sends 6-digit OTP
- `POST /api/register` — creates user with bcrypt hashed password, auto avatar
- `POST /api/login` — validates credentials, returns user object
- `POST /api/forgot-password` — generates 32-byte hex token, stores with 15min expiry
- `POST /api/reset-password` — validates token, updates hashed password
- `GET /api/users` — returns all users ordered by registration date
- `GET /api/online/:username` — checks Redis for online status
- `GET /api/messages/:user1/:user2` — paginated chat history (50 per page)
- `GET /api/recent-chats/:username` — last message per conversation

**Socket.io events handled here:**
- `join` — adds user to room, sets Redis online key, delivers pending messages
- `logout` — removes from Redis immediately (no 8s delay)
- `heartbeat` — refreshes Redis online key
- `send_message` — saves to PostgreSQL first, then attempts live delivery with ACK
- `mark_read` — updates message status, notifies sender
- `typing` / `stop_typing` — forwards to recipient
- `disconnect` — delays offline broadcast by 8s (handles reconnects)

---

### `server/db.js`
PostgreSQL connection pool using `pg` library.
- Creates a pool with env vars (falls back to localhost defaults)
- Sets timezone to `Asia/Kolkata` via connection options
- Tests connection on startup and logs success/failure
- Exports pool for use in `index.js` and `backup.js`

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
- Connects to Redis using env vars
- Logs connection success and errors
- Used for: online user tracking (`online:username` keys)
- Exports client for use in `index.js`

```js
host: process.env.REDIS_HOST || "localhost"
port: process.env.REDIS_PORT || 6379
```

---

### `server/aws.js`
AWS SDK client for LocalStack integration.
- Configures both `SSMClient` and `S3Client` pointing to LocalStack (`http://localhost:4566`)
- Uses fake credentials (`test/test`) for LocalStack
- `getSecret(name)` — fetches SSM SecureString parameter with decryption
- `uploadToS3(key, data)` — uploads JSON data to `foreseesnetwork-assets` bucket
- Both functions have error handling with console logging

---

### `server/backup.js`
Nightly database backup service.
- `backupMessages()` — fetches last 1000 messages, uploads as JSON to S3
  - S3 key: `backups/messages-YYYY-MM-DD.json`
- `backupUsers()` — fetches all users (excluding passwords), uploads as JSON to S3
  - S3 key: `backups/users-YYYY-MM-DD.json`
- `runBackup()` — runs both backups sequentially
- Called from `index.js` at midnight IST every 24 hours

---

### `server/mailer.js`
Email service using Nodemailer + Gmail SMTP.

**How credentials are loaded:**
On server startup, `index.js` fetches `EMAIL_USER` and `EMAIL_PASS` from AWS SSM Parameters and sets them as `process.env` variables. `mailer.js` then uses these env vars to create the Gmail transporter.

```
Server starts
      ↓
aws.js → getSecret("/foreseesnetwork/email_user") → SSM → Gmail address
aws.js → getSecret("/foreseesnetwork/email_pass") → SSM → Gmail app password
      ↓
process.env.EMAIL_USER = "foreseesnetwork@gmail.com"
process.env.EMAIL_PASS = "xxxx xxxx xxxx xxxx"
      ↓
nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
      ↓
Ready to send emails ✅
```

**Gmail App Password Setup:**
Regular Gmail passwords don't work — you need an App Password:
1. Go to **myaccount.google.com/security**
2. Enable **2-Step Verification**
3. Go to **App passwords**
4. Create new → name it anything (e.g. `ForeseesNetwork`)
5. Copy the 16-character password
6. Store in SSM: `/foreseesnetwork/email_pass`

---

**Function 1: `sendOtpEmail(toEmail, otp, username)`**

Called during registration flow:
```
User fills Register form (username, email, password)
      ↓
Frontend calls POST /api/send-otp
      ↓
Backend checks email + username not already taken
      ↓
Generates 6-digit OTP: Math.floor(100000 + Math.random() * 900000)
      ↓
sendOtpEmail() → sends HTML email to user
      ↓
Frontend shows OTP input box
      ↓
User enters OTP → matches → registration completes
```

Email design:
- Purple → pink gradient header with 💬 ForeseesNetwork branding
- Personalized greeting with username
- 6-digit OTP in large bold text on dark background
- "Expires in 10 minutes" warning
- Clean, mobile-friendly layout

---

**Function 2: `sendPasswordResetEmail(toEmail, resetLink, username)`**

Called during forgot password flow:
```
User clicks "Forgot Password" → enters email
      ↓
POST /api/forgot-password
      ↓
Backend finds user by email
      ↓
Generates 32-byte hex token: crypto.randomBytes(32).toString("hex")
      ↓
Stores token + expiry (NOW() + 15 minutes) in users table
      ↓
Reset link: http://localhost:5173/reset-password?token=<hex>
      ↓
sendPasswordResetEmail() → sends HTML email
      ↓
User clicks link → POST /api/reset-password with token + new password
      ↓
Backend validates token not expired → updates hashed password
      ↓
Clears reset_token and reset_expires from DB
```

Email design:
- Same branded purple → pink gradient header
- Personalized greeting with username
- "Reset Password" gradient button linking to reset URL
- "Expires in 15 minutes" warning
- "If you didn't request this, ignore this email" note

---

### `server/init.sql`
PostgreSQL schema initialization script.
- Auto-runs when PostgreSQL container starts for the first time
- Creates 3 tables: `users`, `messages`, `message_sequences`
- Creates 4 indexes for query optimization:
  - `idx_messages_users` — fast lookup by sender/recipient
  - `idx_messages_created` — fast ordering by time
  - `idx_messages_seq` — fast sequence number lookups
  - `idx_messages_unacked` — partial index for undelivered messages only

---

### `server/Dockerfile`
Two-step server container build:
1. Uses `node:18-alpine` base image
2. Installs `tzdata` and sets `TZ=Asia/Kolkata`
3. Copies `package.json` and runs `npm install --production` (no dev deps)
4. Copies source files
5. Exposes port 4000
6. Runs `node index.js`

---

### `Dockerfile` (root — client)
Multi-stage React build:
- **Stage 1 (builder):** `node:18-alpine` — installs deps, accepts `VITE_API_URL` build arg, runs `npm run build`
- **Stage 2 (serve):** `nginx:alpine` — copies built `/app/dist` to Nginx html dir, copies `nginx.conf`
- Final image is tiny — only Nginx + built static files
- Exposes port 80

---

### `nginx.conf`
Nginx reverse proxy configuration for the client container.
- `location /api` — proxies to `http://server-service:4000` (K8s service DNS)
- `location /socket.io` — proxies WebSocket connections to backend
  - Both use `proxy_http_version 1.1` and `Upgrade` headers for WebSocket support
- `location /assets` — caches static assets for 1 year (`Cache-Control: immutable`)
- `location /` — serves React app, falls back to `index.html` for client-side routing

---

### `vite.config.js`
Vite build configuration.
- Uses `@vitejs/plugin-react-swc` for fast React compilation with SWC (Rust-based)
- Minimal config — no custom ports or proxies needed (Nginx handles proxying in production)

---

### `docker-compose.yml`
Local development orchestration with 4 services:

| Service | Image | Ports | Volumes |
|---|---|---|---|
| postgres | postgres:15-alpine | 5434:5432 | postgres_data, init.sql |
| redis | redis:7-alpine | 6379:6379 | — |
| server | livechat-server | 4000:4000 | — |
| client | livechat-client | 80:80 | — |

- All services have health checks
- Server waits for postgres and redis to be healthy before starting
- Client waits for server
- PostgreSQL uses named volume `postgres_data` for persistence
- `init.sql` mounted to auto-create tables on first run
- `LOCALSTACK_URL` set to `http://host.docker.internal:4566` to reach LocalStack from container

---

### `grafana-values.yml`
Helm values override for Grafana SMTP configuration.
- Enables SMTP with Gmail settings
- Configures `from_address` and `from_name` for alert emails
- References Kubernetes secret `grafana-smtp-secret` for password
- Applied during `helm install` or `helm upgrade`

---

### `k8s/namespace.yml`
Creates the `foreseesnetwork` Kubernetes namespace.
All app resources are isolated within this namespace.

---

### `k8s/configmap.yml`
Non-sensitive configuration as Kubernetes ConfigMap (`fn-config`).
Injected into server pod as environment variables:
```
DB_HOST=postgres-service
DB_PORT=5432
DB_NAME=foreseesnetwork
DB_USER=postgres
REDIS_HOST=redis-service
REDIS_PORT=6379
PORT=4000
TZ=Asia/Kolkata
PGTZ=Asia/Kolkata
```

---

### `k8s/secrets.yml`
Sensitive credentials as Kubernetes Secret (`fn-secrets`).
```
DB_PASSWORD
EMAIL_USER
EMAIL_PASS
```
Injected individually into server pod env vars via `secretKeyRef`.

---

### `k8s/postgres.yml`
PostgreSQL deployment with 3 components:
- **Deployment** — runs `postgres:15-alpine`, mounts PVC and init SQL, has readiness probe (`pg_isready`)
- **Service** — ClusterIP on port 5432, accessible as `postgres-service` within cluster
- **PersistentVolumeClaim** — 1Gi storage, `ReadWriteOnce`, ensures data survives pod restarts

---

### `k8s/postgres-init-configmap.yml`
ConfigMap containing `init.sql` schema.
Mounted at `/docker-entrypoint-initdb.d/` in the PostgreSQL container.
PostgreSQL automatically runs any `.sql` files in this directory on first start.
Creates all 3 tables and 4 indexes.

---

### `k8s/redis.yml`
Redis deployment with 2 components:
- **Deployment** — runs `redis:7-alpine`, has readiness probe (`redis-cli ping`)
- **Service** — ClusterIP on port 6379, accessible as `redis-service` within cluster

---

### `k8s/server.yml`
Node.js backend deployment with 2 components:
- **Deployment** — runs `livechat-server`, pulls from GHCR, mounts configmap + secrets, has readiness probe (`GET /api/users`)
  - Resource requests: 100m CPU, 128Mi memory
  - Resource limits: 500m CPU, 512Mi memory
  - `imagePullPolicy: Always` — always pulls latest from GHCR
- **Service** — ClusterIP on port 4000, accessible as `server-service`

---

### `k8s/client.yml`
React frontend deployment with 2 components:
- **Deployment** — runs `livechat-client` (Nginx), pulls from GHCR
  - Resource requests: 50m CPU, 64Mi memory
  - Resource limits: 300m CPU, 256Mi memory
- **Service** — ClusterIP on port 80, accessible as `client-service`

---

### `k8s/hpa.yml`
Horizontal Pod Autoscaler for server and client deployments.

| Deployment | Min | Max | CPU Trigger | Memory Trigger |
|---|---|---|---|---|
| server | 1 | 10 | 70% | 80% |
| client | 1 | 10 | 70% | 80% |

Requires `metrics-server` addon: `minikube addons enable metrics-server`

---

### `k8s/ingress.yml`
Kubernetes Ingress for host-based routing at `foreseesnetwork.local`:
- `/api` → `server-service:4000`
- `/socket.io` → `server-service:4000`
- `/` → `client-service:80`

Annotations:
- `rewrite-target: /` — strips path prefix
- `proxy-read-timeout: 3600` — 1 hour timeout for WebSocket connections
- `proxy-send-timeout: 3600` — 1 hour timeout for WebSocket connections

---

### `terraform/main.tf`
Infrastructure as Code — creates all AWS resources via LocalStack.

**Provider:** AWS pointing to LocalStack at `http://localhost:4566`

**Resources created:**

| Resource | Name | Details |
|---|---|---|
| `aws_s3_bucket` | foreseesnetwork-assets | Main bucket for backups |
| `aws_s3_bucket_versioning` | — | Versioning enabled on bucket |
| `aws_iam_user` | foreseesnetwork-user | IAM user for app access |
| `aws_iam_access_key` | — | Access key for IAM user |
| `aws_iam_user_policy` | foreseesnetwork-policy | S3 CRUD permissions |
| `aws_ssm_parameter` | /foreseesnetwork/db_password | DB password (SecureString) |
| `aws_ssm_parameter` | /foreseesnetwork/email_user | Gmail address (SecureString) |
| `aws_ssm_parameter` | /foreseesnetwork/email_pass | Gmail app password (SecureString) |

**IAM Policy permissions:**
```
s3:GetObject
s3:PutObject
s3:DeleteObject
s3:ListBucket
```

---

### `terraform/variables.tf`
Input variables with defaults:
| Variable | Default | Sensitive |
|---|---|---|
| `aws_region` | us-east-1 | No |
| `app_name` | foreseesnetwork | No |
| `db_password` | postgres | Yes |
| `email_user` | foreseesnetwork@gmail.com | Yes |
| `email_pass` | (app password) | Yes |

---

### `terraform/outputs.tf`
Values exposed after `terraform apply`:
| Output | Description |
|---|---|
| `s3_bucket_name` | Bucket name |
| `s3_bucket_arn` | Bucket ARN |
| `iam_user_name` | IAM username |
| `iam_access_key_id` | Access key ID |
| `iam_secret_access_key` | Secret key (sensitive) |
| `ssm_db_password_path` | SSM path for DB password |

---

## ⚡ Application Features

### Chat Features
- ✅ Real-time messaging with Socket.io
- ✅ Message delivery acknowledgment (sent → delivered → read)
- ✅ Offline message queuing — messages delivered when user reconnects
- ✅ Typing indicators
- ✅ Online/offline user status
- ✅ Recent chats list
- ✅ Chat history with pagination (50 messages per page)
- ✅ Message sequence numbers per conversation

### Auth Features
- ✅ User registration with OTP email verification
- ✅ Login with email + password (bcrypt hashed)
- ✅ Forgot password via email reset link (15-minute expiry)
- ✅ Auto-generated avatar (first letter of username)

### DevOps Features
- ✅ Multi-stage Docker builds (minimal image size)
- ✅ Kubernetes orchestration with auto-restart
- ✅ Horizontal Pod Autoscaling (1–10 pods)
- ✅ CI/CD — auto deploy on every git push
- ✅ Secrets management via AWS SSM Parameters
- ✅ Nightly PostgreSQL + users backup to S3 at midnight IST
- ✅ Prometheus metrics collection
- ✅ Grafana dashboards and email alerts

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

### Users
| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/users` | `{ users: [...] }` |
| GET | `/api/online/:username` | `{ online: true/false }` |

### Messages
| Method | Endpoint | Query | Response |
|---|---|---|---|
| GET | `/api/messages/:user1/:user2` | `?offset=0` | `{ messages, hasMore }` |
| GET | `/api/recent-chats/:username` | — | `{ chats: [...] }` |

---

## 📡 Socket.io Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join` | `username` | User comes online, triggers pending message delivery |
| `logout` | `username` | Explicit logout, immediate offline status |
| `heartbeat` | — | Keep-alive, refreshes Redis online key |
| `send_message` | `{ from, to, text, time }` | Send message with ACK callback |
| `mark_read` | `{ from, to }` | Mark all messages from user as read |
| `typing` | `{ from, to }` | User started typing |
| `stop_typing` | `{ from, to }` | User stopped typing |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `user_online` | `username` | Broadcast when user joins |
| `user_offline` | `username` | Broadcast after 8s disconnect delay |
| `online_list` | `[usernames]` | Sent on join — all currently online |
| `receive_message` | `message object` | New message with ACK callback |
| `message_delivered` | `{ id, seq_num }` | Sent to sender when recipient ACKs |
| `messages_read` | `{ by: username }` | Sent to sender when messages read |
| `typing` | `{ from }` | Forwarded to recipient |
| `stop_typing` | `{ from }` | Forwarded to recipient |

---

## 🌍 Environment Variables

### Backend
| Variable | K8s Source | Default |
|---|---|---|
| `PORT` | configmap | 4000 |
| `DB_HOST` | configmap | localhost |
| `DB_PORT` | configmap | 5432 |
| `DB_NAME` | configmap | foreseesnetwork |
| `DB_USER` | configmap | postgres |
| `DB_PASSWORD` | secret | — |
| `REDIS_HOST` | configmap | localhost |
| `REDIS_PORT` | configmap | 6379 |
| `EMAIL_USER` | secret + SSM | — |
| `EMAIL_PASS` | secret + SSM | — |
| `LOCALSTACK_URL` | hardcoded | http://localhost:4566 |
| `TZ` | configmap | Asia/Kolkata |

---

## 🐳 Docker

### Client Dockerfile (multi-stage)
```
Stage 1 (builder): node:18-alpine
  → npm install
  → VITE_API_URL build arg
  → npm run build → /app/dist

Stage 2 (serve): nginx:alpine
  → copy /app/dist → /usr/share/nginx/html
  → copy nginx.conf
  → expose 80
```

### Server Dockerfile
```
node:18-alpine
  → install tzdata (timezone support)
  → ENV TZ=Asia/Kolkata
  → npm install --production
  → expose 4000
  → node index.js
```

### Docker Compose Services
| Service | Image | Ports | Health Check |
|---|---|---|---|
| postgres | postgres:15-alpine | 5434:5432 | pg_isready |
| redis | redis:7-alpine | 6379:6379 | redis-cli ping |
| server | livechat-server | 4000:4000 | depends on db+redis |
| client | livechat-client | 80:80 | depends on server |

---

## ☸️ Kubernetes Resources

### Deployments & Resources
| Deployment | CPU Request | CPU Limit | Mem Request | Mem Limit |
|---|---|---|---|---|
| server | 100m | 500m | 128Mi | 512Mi |
| client | 50m | 300m | 64Mi | 256Mi |
| postgres | — | — | — | — |
| redis | — | — | — | — |

### HPA
| Deployment | Min | Max | CPU | Memory |
|---|---|---|---|---|
| server | 1 | 10 | 70% | 80% |
| client | 1 | 10 | 70% | 80% |

### Ingress (foreseesnetwork.local)
| Path | Backend | Port |
|---|---|---|
| `/api` | server-service | 4000 |
| `/socket.io` | server-service | 4000 |
| `/` | client-service | 80 |

---

## 🏗️ Terraform + LocalStack

### AWS Resources
| Resource | Name | Purpose |
|---|---|---|
| S3 Bucket | foreseesnetwork-assets | Nightly DB backups (versioning enabled) |
| IAM User | foreseesnetwork-user | Programmatic S3 access |
| IAM Policy | foreseesnetwork-policy | S3 CRUD permissions |
| SSM Parameter | /foreseesnetwork/db_password | PostgreSQL password |
| SSM Parameter | /foreseesnetwork/email_user | Gmail address |
| SSM Parameter | /foreseesnetwork/email_pass | Gmail app password |

### S3 Backup Files
```
backups/
├── messages-2026-03-16.json   ← last 1000 messages
├── messages-2026-03-17.json
├── users-2026-03-16.json      ← all users (no passwords)
└── users-2026-03-17.json
```

### Apply
```bash
localstack start -d
cd terraform
terraform init
terraform plan
terraform apply -auto-approve
```

### Outputs after apply
```bash
terraform output s3_bucket_name     # foreseesnetwork-assets
terraform output iam_user_name      # foreseesnetwork-user
terraform output iam_access_key_id  # access key
terraform output ssm_db_password_path # /foreseesnetwork/db_password
```

---

## 🔄 CI/CD Pipeline

```
git push to main
      ↓
JOB 1 — Build & Push (self-hosted runner ~5min)
├── actions/checkout@v4
├── docker/login-action → ghcr.io
├── docker/setup-buildx-action
├── docker/metadata-action → tags: latest + SHA
├── docker/build-push-action → livechat-server
└── docker/build-push-action → livechat-client

      ↓
JOB 2 — Deploy to Kubernetes (self-hosted runner ~45s)
├── Write kubeconfig → /Users/nivashp/.kube/config
├── sed replace image tags in k8s/server.yml + k8s/client.yml
├── kubectl apply -f k8s/ --namespace=foreseesnetwork
├── kubectl rollout status deployment/server (timeout 300s)
├── kubectl rollout status deployment/client (timeout 300s)
└── kubectl get pods

      ↓
JOB 3 — Notify on Failure
└── Echo failure info (Slack/Discord webhook optional)
```

### GitHub Secrets
| Secret | Command |
|---|---|
| `MINIKUBE_CA_CRT` | `cat ~/.minikube/ca.crt \| base64 \| tr -d '\n'` |
| `MINIKUBE_CLIENT_CRT` | `cat ~/.minikube/profiles/minikube/client.crt \| base64 \| tr -d '\n'` |
| `MINIKUBE_CLIENT_KEY` | `cat ~/.minikube/profiles/minikube/client.key \| base64 \| tr -d '\n'` |

---

## 📊 Monitoring

### Stack
| Component | Purpose | Namespace |
|---|---|---|
| **Prometheus** | Scrapes metrics every 15s from all pods | monitoring |
| **Grafana** | Visualizes metrics, manages alerts, sends emails | monitoring |
| **AlertManager** | Routes firing alerts to contact points | monitoring |
| **Node Exporter** | Exposes host machine CPU/memory/disk metrics | monitoring |
| **kube-state-metrics** | Exposes Kubernetes object state metrics | monitoring |

---

### Install via Helm

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install full monitoring stack with Grafana SMTP config
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f grafana-values.yml
```

---

### `grafana-values.yml` — SMTP Configuration

Grafana is configured to send emails via Gmail SMTP:

```yaml
grafana.ini:
  smtp:
    enabled: true
    host: smtp.gmail.com:587
    user: foreseesnetwork@gmail.com
    password: ${GF_SMTP_PASSWORD}   ← from Kubernetes secret
    from_address: foreseesnetwork@gmail.com
    from_name: ForeseesNetwork Alerts
    startTLS_policy: MandatoryStartTLS
```

The Gmail app password is stored securely in a Kubernetes secret (not hardcoded):

```bash
# Create the SMTP secret
kubectl create secret generic grafana-smtp-secret \
  --from-literal=smtp-password=YOUR_GMAIL_APP_PASSWORD \
  -n monitoring
```

If SMTP config needs to be updated directly:
```bash
kubectl patch configmap monitoring-grafana -n monitoring --type merge \
  -p '{"data":{"grafana.ini":"...[smtp] section..."}}'
kubectl rollout restart deployment/monitoring-grafana -n monitoring
```

---

### Access Grafana

```bash
# Port forward
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```

Open: `http://localhost:3000`

Get admin password:
```bash
kubectl get secret monitoring-grafana -n monitoring \
  -o jsonpath='{.data.admin-password}' | base64 -d
```

Login: `admin` / (password from above command)

---

### Grafana Dashboards

Navigate to **Dashboards → Browse** to find:

| Dashboard | What it shows |
|---|---|
| Kubernetes / Compute Resources / Namespace (Pods) | CPU + memory per pod in foreseesnetwork |
| Kubernetes / Compute Resources / Namespace (Workloads) | Per deployment metrics |
| Node Exporter / Nodes | Host machine CPU, memory, disk, network |
| Alertmanager / Overview | All firing and resolved alerts |

**To view your app metrics:**
1. Go to Dashboards → Kubernetes / Compute Resources / Namespace (Pods)
2. Select namespace: `foreseesnetwork`
3. See CPU and memory for server, client, postgres, redis pods

---

### Contact Point Setup

A contact point named **ForeseesNetwork Alerts** was created in Grafana:

**Path:** Alerting → Contact points → ForeseesNetwork Alerts
- **Integration:** Email
- **Address:** `foreseesnetwork@gmail.com`

To test the contact point:
1. Go to **Alerting → Contact points**
2. Click **ForeseesNetwork Alerts**
3. Click **Test** → **Send test notification**
4. Check inbox for test email from Grafana

---

### Alert Rules

All 3 alert rules are in folder **ForeseesNetwork**, group **foreseesnetwork-alerts** (evaluated every 1 minute).

#### 1. High CPU Usage
| Setting | Value |
|---|---|
| Name | High CPU Usage |
| PromQL | `sum(rate(container_cpu_usage_seconds_total{namespace="foreseesnetwork"}[5m])) by (pod)` |
| Condition | IS ABOVE `0.8` (80%) |
| Pending period | 1 minute |
| Contact point | ForeseesNetwork Alerts |
| Summary | High CPU usage detected in ForeseesNetwork |
| Description | One or more pods are using more than 80% CPU |

#### 2. Pod Restarted
| Setting | Value |
|---|---|
| Name | Pod Restarted |
| PromQL | `kube_pod_container_status_restarts_total{namespace="foreseesnetwork"}` |
| Condition | IS ABOVE `0` |
| Pending period | None (fires immediately) |
| Contact point | ForeseesNetwork Alerts |
| Summary | Pod crashed in ForeseesNetwork |
| Description | A pod has restarted — check logs immediately |

#### 3. High Memory Usage
| Setting | Value |
|---|---|
| Name | High Memory Usage |
| PromQL | `sum(container_memory_working_set_bytes{namespace="foreseesnetwork", container!=""}) by (pod) / 1024 / 1024` |
| Condition | IS ABOVE `400` (400MB) |
| Pending period | 1 minute |
| Contact point | ForeseesNetwork Alerts |
| Summary | High memory usage in ForeseesNetwork |
| Description | A pod is using more than 400MB of memory |

---

### Alert States

| State | Meaning |
|---|---|
| 🟢 Normal | Threshold not breached — everything healthy |
| 🟡 Pending | Threshold breached, waiting for pending period |
| 🔴 Firing | Alert active — email sent to contact point |
| ✅ Resolved | Problem fixed — recovery email sent |
| ⚪ No Data | Query returned no results — check PromQL |

---

### Email Alert Format

When an alert fires, Grafana sends an email containing:
- 🔥 Number of firing instances
- Alert name and folder
- Summary and description
- Current metric values (e.g. `A=5 C=1`)
- Labels: alertname, container, namespace, pod
- Timestamp of when it was observed
- **Silence** button link to mute the alert

When resolved, a separate **✅ Resolved** email is sent automatically.

---

### Test Alert by Simulating Pod Crash

```bash
# Delete server pod — Kubernetes auto-recreates it
# This triggers the "Pod Restarted" alert
kubectl delete pod -l app=server -n foreseesnetwork

# Watch pod recreate
kubectl get pods -n foreseesnetwork

# Check email inbox — alert fires within 1-2 minutes
```

---

### Useful Monitoring Commands

```bash
# Check all monitoring pods
kubectl get pods -n monitoring

# Check Prometheus targets
kubectl port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 -n monitoring
# Open http://localhost:9090/targets

# Check AlertManager
kubectl port-forward svc/monitoring-kube-prometheus-alertmanager 9093:9093 -n monitoring
# Open http://localhost:9093

# Check HPA metrics
kubectl get hpa -n foreseesnetwork

# Pod resource usage
kubectl top pods -n foreseesnetwork

# Upgrade Grafana config
helm upgrade monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring -f grafana-values.yml
```

---

## 📋 Useful Commands

```bash
# Pod status
kubectl get pods -n foreseesnetwork

# Logs
kubectl logs deployment/server -n foreseesnetwork
kubectl logs deployment/client -n foreseesnetwork

# Describe pod (for debugging)
kubectl describe pod <pod-name> -n foreseesnetwork

# Restart deployment
kubectl rollout restart deployment/server -n foreseesnetwork

# HPA status
kubectl get hpa -n foreseesnetwork

# Resource usage
kubectl top pods -n foreseesnetwork
kubectl top nodes

# DB access
kubectl exec -it deployment/postgres -n foreseesnetwork \
  -- psql -U postgres -d foreseesnetwork

# List all users
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
- [ ] Phase 7 — Staging + Production environments with approval gates
- [ ] VPA for PostgreSQL and Redis
- [ ] ELK stack for centralized logging
- [ ] SSL/HTTPS with cert-manager
- [ ] Rate limiting in Nginx
- [ ] Group chat support
- [ ] File/image sharing
- [ ] Message reactions

---

## 👤 Author

**Nivashp** (iKryptonian)
- GitHub: [@ikryptonian](https://github.com/ikryptonian)
- Repo: [github.com/ikryptonian/foreseesnetwork](https://github.com/ikryptonian/foreseesnetwork)
