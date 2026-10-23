# 🚀 MessageAPI — Backend Developer Specification & Engineering Guide

> **Version:** 1.0.0  
> **Target Audience:** Backend Developers, Fullstack Engineers, DevOps & Solution Architects  
> **Status:** Ready for Implementation  
> **Last Updated:** 2026-10-07

---

## 📌 Executive Summary

**MessageAPI** is a self-hosted, enterprise-grade **WhatsApp Business Gateway** and **AI-powered ERP Query Engine**. It replaces the expensive official Meta Cloud API ($0.05/conversation fee) by pairing directly with standard or business WhatsApp numbers via multi-device Web protocols (e.g. Baileys / WPPConnect).

This document serves as the **complete technical blueprint** for backend developers to implement the server-side architecture, database models, WhatsApp session lifecycle, AI processing pipeline, anti-ban pacing, and REST/WebSocket APIs required to power the MessageAPI frontend.

---

## 🏗️ 1. High-Level Architecture Overview

```
                          ┌────────────────────────────────────────┐
                          │   Frontend UI (Next.js 16 / React 19)   │
                          │   Workspace • Live Chat • Sessions     │
                          └───────────────────▲────────────────────┘
                                              │ REST API / SSE / WebSockets
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  MESSAGEAPI BACKEND CORE                                │
│                                                                                        │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────────────────┐  │
│  │   API Gateway & Auth  │  │  Multi-Session Manager  │  │   AI ERP Query & RAG Engine│  │
│  │  • x-api-key auth     │  │  • Baileys / Multi-Dev   │  │  • Intent classification   │  │
│  │  • Rate limiting      │  │  • QR Generation (SSE)   │  │  • SKU & Vector Search     │  │
│  │  • Webhook Dispatcher │  │  • Session Auto-Recovery │  │  • Vision OCR / Whisper STT│  │
│  └───────────┬───────────┘  └────────────┬────────────┘  └─────────────┬─────────────┘  │
│              │                           │                             │                │
│              ▼                           ▼                             ▼                │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────────────────┐  │
│  │   Anti-Ban Safe Queue │  │   Database & Storage    │  │   External Integrations   │  │
│  │  • BullMQ / Redis     │  │  • PostgreSQL / SQLite  │  │  • OpenAI / Claude / Gemini│ │
│  │  • Typing simulation  │  │  • MongoDB (Catalog)    │  │  • Client Webhooks (HMAC)  │  │
│  │  • Jitter delay (1-30s│  │  • Redis (Cache/State)  │  │  • S3 / Local Media Store  │  │
│  └───────────────────────┘  └─────────────────────────┘  └───────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                             ┌──────────────────────────────────┐
                             │    WhatsApp Web Gateway Socket   │
                             │  (Customers on Real WhatsApp)    │
                             └──────────────────────────────────┘
```

---

## 💻 2. Recommended Tech Stack

| Layer | Recommended Technology | Rationale |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js (TypeScript)** or **FastAPI (Python)** | Node.js has native support for `@whiskeysockets/baileys` (the most robust multi-device WhatsApp library). |
| **WhatsApp Engine** | `@whiskeysockets/baileys` (v6+) | Multi-device support, lightweight WebSocket connection, zero browser overhead compared to Puppeteer. |
| **Database** | **PostgreSQL** + **Prisma ORM** (or MongoDB) | Relational integrity for accounts, orders, chat history, and JSONB support for flexible catalog items. |
| **Queue & Pacing** | **Redis** + **BullMQ** | Essential for safe anti-ban delay queuing, human typing simulation, and rate-limiting outgoing messages. |
| **AI / LLM Layer** | **OpenAI GPT-4o-mini / Anthropic Claude 3.5 / Gemini 2.0** | High-speed, cost-effective intent parsing, inventory extraction, and conversational responses. |
| **Audio & Vision** | **OpenAI Whisper** (Voice Notes) + **Vision API / Tesseract** (OCR) | Transcribing customer voice notes and reading handwritten prescription / grocery list photos. |
| **Realtime Stream** | **Server-Sent Events (SSE)** or **Socket.io** | Streaming live QR codes, connection telemetry, typing status, and incoming chat messages to the frontend. |

---

## 🗄️ 3. Database Schema & Data Models

### 3.1 BusinessAccount (`business_accounts`)
Stores business profile, credentials, industry settings, and anti-ban preferences.

```prisma
model BusinessAccount {
  id                  String            @id @default(cuid())
  businessName        String
  category            BusinessCategory  // 'medicine' | 'gym' | 'grocery' | 'electronics' | 'restaurant' | 'salon' | 'custom'
  categoryLabel       String
  ownerName           String
  phone               String
  email               String?
  address             String?
  currency            String            @default("₹")
  workingHours        String            @default("09:00 AM - 09:00 PM")
  greetingMessage     String            @db.Text
  aiPersonaPrompt     String            @db.Text
  
  // Anti-Ban & Pacing Settings
  minDelaySeconds     Int               @default(8)
  maxDelaySeconds     Int               @default(18)
  typingSimulation    Boolean           @default(true)
  typingSpeedWpm      Int               @default(60)
  
  // Feature Toggles
  enableAi            Boolean           @default(true)
  enableStockQueries  Boolean           @default(true)
  allowedChats        String            @default("*")
  
  // Authentication & Webhooks
  apiKey              String            @unique
  webhookUrl          String?
  webhookSecret       String?
  
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  
  // Relations
  sessions            WhatsAppSession[]
  catalog             CatalogItem[]
  contacts            Contact[]
  orders              Order[]
}

enum BusinessCategory {
  medicine
  gym
  grocery
  electronics
  restaurant
  salon
  custom
}
```

---

### 3.2 WhatsAppSession (`whatsapp_sessions`)
Represents an active multi-device WhatsApp phone connection.

```prisma
model WhatsAppSession {
  id              String            @id // e.g. "wa_primary_01"
  businessId      String
  name            String            // e.g. "Primary Store Desk"
  phoneNumber     String?           // e.g. "+919382468250"
  status          SessionStatus     @default(DISCONNECTED) // 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  qrCode          String?           @db.Text // Base64 or raw QR string for pairing
  authCredentials Json?             // Baileys multi-file auth credentials / keys
  isPrimary       Boolean           @default(false)
  autoReconnect   Boolean           @default(true)
  
  // Diagnostics & Telemetry
  deviceModel     String?           @default("WhatsApp Web Multi-Device")
  batteryPercent  Int?              @default(100)
  latencyMs       Int?              @default(35)
  lastConnectedAt DateTime?
  
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  business        BusinessAccount   @relation(fields: [businessId], references: [id], onDelete: Cascade)
}

enum SessionStatus {
  CONNECTED
  CONNECTING
  DISCONNECTED
}
```

---

### 3.3 CatalogItem (`catalog_items`)
Stores the live inventory / price list for the business. Used by the AI ERP Query Engine.

```prisma
model CatalogItem {
  id            String          @id @default(cuid())
  businessId    String
  sku           String          // e.g. "MED-001", "GYM-M01"
  name          String          // e.g. "Paracetamol 650mg"
  category      String          // e.g. "Fever & Pain"
  price         Decimal         @db.Decimal(10, 2)
  stock         Int             @default(0)
  unit          String          @default("pcs") // 'strip', 'month', 'kg', 'bottle'
  description   String?         @db.Text
  isAvailable   Boolean         @default(true)
  
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  business      BusinessAccount @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, name])
  @@index([businessId, sku])
}
```

---

### 3.4 Contact & ChatMessage (`contacts`, `chat_messages`)
Stores multi-contact chat history, tags, voice audio references, and message delivery statuses.

```prisma
model Contact {
  id            String          @id @default(cuid())
  businessId    String
  phone         String          // e.g. "+919876543210"
  name          String          // e.g. "Rahul Sharma"
  avatarBg      String?         @default("bg-emerald-600")
  initials      String?         @default("RS")
  tag           String          @default("Active Inquiry") // 'Priority' | 'Lead' | 'Delivery' | 'Paid Order'
  unreadCount   Int             @default(0)
  isOnline      Boolean         @default(false)
  lastSeenAt    DateTime?
  
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  messages      ChatMessage[]
  orders        Order[]
  business      BusinessAccount @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@unique([businessId, phone])
}

model ChatMessage {
  id            String          @id @default(cuid())
  contactId     String
  sender        MessageSender   // 'customer' | 'business' | 'system'
  text          String          @db.Text
  messageType   MessageType     @default(TEXT) // 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'CATALOG_CARD'
  mediaUrl      String?
  isAiGenerated Boolean         @default(false)
  status        MessageStatus   @default(SENT) // 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  timestamp     DateTime        @default(now())

  contact       Contact         @relation(fields: [contactId], references: [id], onDelete: Cascade)
}

enum MessageSender {
  customer
  business
  system
}

enum MessageType {
  TEXT
  IMAGE
  AUDIO
  DOCUMENT
  CATALOG_CARD
}

enum MessageStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}
```

---

### 3.5 Order (`orders`)
Records orders, appointments, or service bookings placed via WhatsApp chat.

```prisma
model Order {
  id              String        @id @default(cuid())
  businessId      String
  contactId       String
  orderNumber     String        @unique // e.g. "ORD-2026-1042"
  totalAmount     Decimal       @db.Decimal(10, 2)
  items           Json          // Array of [{ sku, name, quantity, price, unit }]
  deliveryAddress String?       @db.Text
  status          OrderStatus   @default(PENDING) // 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED'
  paymentStatus   PaymentStatus @default(UNPAID)  // 'UNPAID' | 'PAID' | 'COD'
  notes           String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  business        BusinessAccount @relation(fields: [businessId], references: [id])
  contact         Contact         @relation(fields: [contactId], references: [id])
}

enum OrderStatus {
  PENDING
  CONFIRMED
  DISPATCHED
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  UNPAID
  PAID
  COD
}
```

---

## 📡 4. REST API Endpoints Specification

### 4.1 Master Authentication
All developer and backend API requests require the header:
```http
x-api-key: msgapi_live_med_88921a99
```

---

### 4.2 WhatsApp Session Management

#### `POST /api/v1/sessions`
Creates and initializes a new WhatsApp multi-device instance.
- **Request Body:**
  ```json
  {
    "sessionId": "wa_support_02",
    "sessionName": "Customer Support Desk",
    "isPrimary": false
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "sessionId": "wa_support_02",
    "status": "CONNECTING",
    "message": "Session created. Listen to /api/v1/sessions/wa_support_02/qr-stream for live QR code."
  }
  ```

#### `GET /api/v1/sessions/:sessionId/qr-stream` (Server-Sent Events)
Streams real-time QR code strings, reconnection events, and connection status.
- **Headers:** `Accept: text/event-stream`
- **Events Emitted:**
  - `event: qr` → `{ "qr": "2@4k12j3123...", "expireInSeconds": 20 }`
  - `event: ready` → `{ "status": "CONNECTED", "phoneNumber": "+919382468250" }`
  - `event: disconnected` → `{ "status": "DISCONNECTED", "reason": "LOGGED_OUT" }`

#### `GET /api/v1/sessions`
Lists all active WhatsApp sessions and their telemetry health.
- **Response `200 OK`:**
  ```json
  {
    "sessions": [
      {
        "id": "wa_primary_01",
        "name": "Primary WhatsApp",
        "status": "CONNECTED",
        "phoneNumber": "+919382468250",
        "batteryPercent": 88,
        "latencyMs": 38,
        "isPrimary": true,
        "lastConnected": "2026-10-07T14:30:00Z"
      }
    ]
  }
  ```

#### `DELETE /api/v1/sessions/:sessionId`
Disconnects and deletes session credentials from storage.

---

### 4.3 Outbound Message Dispatch

#### `POST /api/v1/messages/send`
Queues an outbound message through the Anti-Ban Pacing Queue.
- **Request Body:**
  ```json
  {
    "sessionId": "wa_primary_01",
    "to": "+919876543210",
    "messageType": "text",
    "content": "Hello Rahul! Paracetamol 650mg is in stock (₹32.00/strip).",
    "antiBanPacing": true,
    "simulateTyping": true
  }
  ```
- **Response `202 Accepted`:**
  ```json
  {
    "success": true,
    "messageId": "msg_8921a4f0",
    "status": "QUEUED",
    "scheduledDispatchInSeconds": 8
  }
  ```

#### `POST /api/v1/messages/send-media`
Dispatches images, documents (PDF invoices), product cards, or audio voice notes.
- **Request Body:**
  ```json
  {
    "sessionId": "wa_primary_01",
    "to": "+919876543210",
    "messageType": "image",
    "mediaUrl": "https://storage.yourdomain.com/invoices/INV-4092.pdf",
    "caption": "Here is your digital invoice for Order #4092. Thank you!"
  }
  ```

---

### 4.4 Inbound Webhooks (Delivered to Client CRM/Backend)
When a customer sends a message to the WhatsApp number, MessageAPI fires an HMAC-signed POST request to `webhookUrl`.

- **Headers Sent:**
  ```http
  Content-Type: application/json
  x-messageapi-signature: sha256=4f2a718c...
  ```
- **Payload:**
  ```json
  {
    "event": "message.received",
    "businessId": "biz_apollo_pharma",
    "sessionId": "wa_primary_01",
    "from": "+919876543210",
    "senderName": "Rahul Sharma",
    "messageId": "wamid.HBgLM...",
    "timestamp": 1791384000,
    "message": {
      "type": "text",
      "text": "Do you have Amoxicillin 500mg in stock?"
    }
  }
  ```

---

### 4.5 Live Catalog & ERP Query API

#### `POST /api/v1/catalog`
Creates or bulk-updates inventory items.
- **Request Body:**
  ```json
  {
    "items": [
      {
        "sku": "MED-001",
        "name": "Paracetamol 650mg (Dolo)",
        "category": "Fever & Pain",
        "price": 32.00,
        "stock": 120,
        "unit": "strip",
        "description": "15 tablets per strip",
        "isAvailable": true
      }
    ]
  }
  ```

#### `POST /api/v1/erp/query`
Natural language query engine used by AI or custom ERP frontends.
- **Request Body:**
  ```json
  {
    "query": "Is paracetamol or fever tablet available and what is the price?"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "matched": true,
    "items": [
      {
        "sku": "MED-001",
        "name": "Paracetamol 650mg (Dolo)",
        "price": 32.00,
        "stock": 120,
        "unit": "strip",
        "inStock": true
      }
    ],
    "aiGeneratedReply": "✅ Paracetamol 650mg (Dolo) is in stock! Price is ₹32.00 per strip (15 tablets). We have 120 strips available. Would you like to order?"
  }
  ```

---

## 🛡️ 5. Anti-Ban Safe Pacing Engine Specification

### 5.1 Why Numbers Get Banned
WhatsApp detects and bans automated numbers based on:
1. **Instantaneous replies** (e.g. replying in 50ms every time).
2. **Missing human presence** (sending messages without `composing` / typing indicators).
3. **High bursts of outbound messages** to numbers that haven't saved your contact.

### 5.2 Implementation Algorithm (BullMQ / Redis Queue)

```typescript
// Pseudo-code for Anti-Ban Outbound Worker
async function processOutboundMessage(job: Job<MessageJobData>) {
  const { sessionId, to, content, minDelay, maxDelay, typingSim } = job.data;
  const sock = getBaileysSocket(sessionId);

  // 1. Calculate randomized human jitter delay
  const randomDelaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  
  // 2. Simulate human presence: Set 'composing' state
  if (typingSim) {
    await sock.sendPresenceUpdate('composing', to);
    // Simulates natural typing duration based on text length (e.g. 50 words per min)
    const typingTimeMs = Math.min(randomDelaySeconds * 1000, 4000);
    await sleep(typingTimeMs);
  } else {
    await sleep(randomDelaySeconds * 1000);
  }

  // 3. Clear presence status
  await sock.sendPresenceUpdate('paused', to);

  // 4. Send actual message payload
  const result = await sock.sendMessage(to, { text: content });

  // 5. Update message status in Database to 'SENT'
  await markMessageSent(job.data.messageDbId, result.key.id);
}
```

---

## 🤖 6. AI ERP Query & Multimodal Pipeline

```
Customer Message (Text / Voice / Image)
                 │
                 ├──► [Voice Note (.ogg/.opus)] ──► OpenAI Whisper STT ──► Transcribed Text
                 │
                 ├──► [Image (.jpg / Rx Photo)] ──► OCR / GPT-4o-Vision ──► Extracted Medication/Item Names
                 │
                 └──► [Plain Text Query]
                                │
                                ▼
                   ┌───────────────────────────┐
                   │  Intent Classification &  │
                   │  SKU / Catalog Extraction │
                   └────────────┬──────────────┘
                                │
                                ▼
                   ┌───────────────────────────┐
                   │  Live Database Stock &    │
                   │  Price Verification       │
                   └────────────┬──────────────┘
                                │
                                ▼
                   ┌───────────────────────────┐
                   │  Formatted WhatsApp Reply │
                   │  (Total Cart + Address Q) │
                   └───────────────────────────┘
```

### 6.1 Intent Categories Handled
1. **Catalog & Stock Queries**: Matches SKU, item name substrings, and category keywords against `catalog_items`.
2. **Operating Hours & Location**: Answers store timing, address, and Google Map directions.
3. **Prescription / List Ordering**: Parses photos, builds line-item cart, requests delivery address.
4. **Order Confirmation & Digital Billing**: Generates order ID, logs order record, shares summary.
5. **Human Escalation**: Detects customer frustration or requests for store manager and notifies owner phone.

---

## 📂 7. Industry-Specific Business Logic

| Industry | Specific Backend Logic |
| :--- | :--- |
| **💊 Pharmacy** | • Prescription required check for antibiotic/restricted drug categories.<br>• Dosage precautions injection in prompt.<br>• Automated refill ping after 28 days. |
| **🏋️ Gym** | • Membership tier rate-cards (Monthly, 3-Mo, Annual VIP).<br>• Personal trainer slot booking calendar conflict check.<br>• Protein & supplement inventory queries. |
| **🛒 Grocery** | • Handwritten grocery list OCR line parser.<br>• Free delivery minimum order threshold checks (e.g. ₹500).<br>• Delivery address collection prompt. |
| **⚡ Electronics** | • Technical specification lookup (RAM, refresh rate, warranty duration).<br>• Serial number warranty verification.<br>• Digital GST invoice PDF generation. |
| **🍽️ Restaurant** | • Live special chef menu formatting with Veg/Non-Veg indicators.<br>• Table reservation party size and time slot recording.<br>• Takeaway prep time estimates. |
| **✂️ Salon** | • Service rate card sharing.<br>• Stylist schedule slot reservation.<br>• Bridal / Groom package inquiry intake. |
| **🏢 Custom / B2B** | • Universal lead capture (Name, Company, Requirement).<br>• Automatic webhook push to client CRM/Slack/Database. |

---

## ⚡ 8. Realtime Events & WebSockets / SSE Specification

Clients (like the Next.js frontend workspace) connect to:
```http
GET /api/v1/events?sessionId=wa_primary_01
```

### Event Types:
```json
// 1. WhatsApp Connection Status
{
  "type": "SESSION_STATUS_CHANGED",
  "sessionId": "wa_primary_01",
  "status": "CONNECTED",
  "batteryPercent": 92,
  "latencyMs": 34
}

// 2. Incoming Customer Message
{
  "type": "NEW_MESSAGE",
  "contactId": "c_9876543210",
  "message": {
    "id": "msg_90123",
    "sender": "customer",
    "text": "Is Paracetamol 650mg available?",
    "timestamp": "11:42 AM",
    "status": "delivered"
  }
}

// 3. AI Composing State
{
  "type": "AI_TYPING",
  "contactId": "c_9876543210",
  "isTyping": true
}
```

---

## 🔒 9. Environment Variables Checklist (`.env.example`)

```env
# Server Config
PORT=5000
NODE_ENV=production
API_SECRET_KEY=your_master_secret_here

# Database (PostgreSQL / SQLite / MongoDB)
DATABASE_URL="postgresql://user:password@localhost:5432/messageapi?schema=public"

# Redis (Queues & Safe Pacing)
REDIS_URL="redis://localhost:6379"

# AI & Multimodal Credentials
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="..."

# Media Storage (S3 / Cloudinary / Local)
STORAGE_DRIVER=local
UPLOAD_DIR="./uploads"

# WhatsApp Session Storage Path
SESSION_AUTH_DIR="./whatsapp_auth_sessions"
```

---

## ✅ 10. Step-by-Step Implementation Roadmap for Backend Developers

1. **Step 1: Project Setup & Database Migration**
   - Initialize TypeScript Node.js project.
   - Run Prisma migrations for `BusinessAccount`, `WhatsAppSession`, `CatalogItem`, `Contact`, `ChatMessage`, and `Order`.
2. **Step 2: WhatsApp Baileys Multi-Session Engine**
   - Implement `SessionManager` class to create, restore, and destroy Baileys instances.
   - Wire SSE endpoint for live QR code streaming to the frontend.
3. **Step 3: Anti-Ban Queue with BullMQ**
   - Create Redis queue worker with randomized pacing delays and `sendPresenceUpdate('composing')`.
4. **Step 4: AI ERP Engine & Catalog Search**
   - Implement exact + vector search for catalog lookups.
   - Wire Whisper audio transcription and Vision OCR parsing.
5. **Step 5: REST API & Webhooks**
   - Implement `/api/v1/messages/send`, `/api/v1/catalog`, and outbound HMAC webhooks.
6. **Step 6: Frontend Workspace Integration**
   - Connect the Next.js frontend (`BusinessWorkspace.tsx`) to real backend endpoints.

---

*This specification is designed to be exhaustive, leaving zero ambiguity for any backend engineer building out the production MessageAPI service.*
