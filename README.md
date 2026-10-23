# 🚀 MessageAPI — Backend Server

Self-hosted WhatsApp Business Gateway & LangChain + pgvector RAG ERP Query Engine.

---

## 🏗️ Architecture

- **Runtime:** Node.js (TypeScript) + Express
- **WhatsApp Web Gateway:** `@whiskeysockets/baileys` (Multi-Device socket connection, QR streaming)
- **Database:** PostgreSQL + Prisma ORM
- **Semantic Search & RAG:** LangChain + `pgvector` extension (Cosine distance similarity)
- **Streaming:** Server-Sent Events (SSE) for real-time QR codes & chat events

---

## ⚡ Quick Start

### 1. Start PostgreSQL with pgvector
You can start PostgreSQL with `pgvector` enabled using Docker Compose:

```bash
docker compose up -d
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Generate Prisma Client & Run Migrations
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Seed Initial Accounts & Catalog
```bash
npm run prisma:seed
```

### 5. Start Development Server
```bash
npm run dev
```

The server will start at `http://localhost:5000/api/v1`.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health check |
| `GET` | `/api/v1/accounts` | List business accounts |
| `POST` | `/api/v1/accounts` | Create new business account |
| `GET` | `/api/v1/sessions` | List active WhatsApp sessions |
| `POST` | `/api/v1/sessions` | Create and initialize a WhatsApp session |
| `GET` | `/api/v1/sessions/:sessionId/qr-stream` | **SSE** Live QR code stream |
| `POST` | `/api/v1/messages/send` | Send outbound text message |
| `POST` | `/api/v1/messages/send-media` | Send outbound media/documents |
| `GET` | `/api/v1/catalog` | Get live product catalog |
| `POST` | `/api/v1/catalog` | Bulk create or update catalog items |
| `POST` | `/api/v1/erp/query` | Natural language ERP query (RAG powered) |
| `POST` | `/api/v1/rag/sync` | Sync & index catalog into pgvector embeddings |
| `POST` | `/api/v1/rag/search` | Semantic cosine similarity search |
| `GET` | `/api/v1/events` | **SSE** Realtime event stream for frontend |

---

## 🔑 Authentication
Include the `x-api-key` header in requests:
```http
x-api-key: msgapi_live_med_88921a99
```
Or use the master secret key defined in `.env`:
```http
x-api-key: msgapi_master_secret_key_889922
```
