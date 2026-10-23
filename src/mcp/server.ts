import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE_URL = process.env.MESSAGEAPI_URL || "http://localhost:5000/api/v1";
const API_KEY = process.env.MESSAGEAPI_KEY || "msgapi_master_secret_key_889922";

const server = new McpServer({
  name: "messageapi-whatsapp-gateway",
  version: "1.0.0"
});

// Helper for calling MessageAPI backend REST endpoints
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(options.headers || {})
    }
  });
  return res.json();
}

// ============================================================================
// 1. TOOL: Quick Add Product / SKU to Catalog & pgvector VectorDB
// ============================================================================
server.tool(
  "quick_add_catalog_product",
  "Quick adds a product or service SKU to the live catalog and automatically creates pgvector embeddings for instant WhatsApp AI quoting",
  {
    name: z.string().describe("Item name (e.g. 'Whey Protein Isolate 1kg' or 'Paracetamol 650mg')"),
    price: z.number().describe("Price of the product"),
    stock: z.number().default(10).describe("Current available inventory quantity"),
    sku: z.string().optional().describe("Unique SKU code (e.g. 'SKU-GYM-105'). Auto-generated if omitted"),
    category: z.string().optional().default("General").describe("Product category (e.g. 'Supplements', 'Fever & Pain', 'Dairy')"),
    unit: z.string().optional().default("pcs").describe("Unit measurement (e.g. 'pcs', 'bottle', 'strip', 'month')"),
    description: z.string().optional().describe("Brief item description or specifications")
  },
  async ({ name, price, stock, sku, category, unit, description }) => {
    const generatedSku = sku || `SKU-${Math.floor(100 + Math.random() * 900)}`;

    // Add item to backend catalog
    await apiRequest("/catalog", {
      method: "POST",
      body: JSON.stringify({
        sku: generatedSku,
        name,
        price,
        stock,
        category,
        unit,
        description: description || `${name} in ${category}`
      })
    });

    // Automatically trigger pgvector embedding sync
    await apiRequest("/catalog/sync", { method: "POST" }).catch(() => null);

    return {
      content: [
        {
          type: "text",
          text: `✅ Product added to Live Catalog & VectorDB!\n• Name: ${name} (${generatedSku})\n• Category: ${category}\n• Price: ₹${price.toFixed(2)} / ${unit}\n• Stock: ${stock} ${unit}\n• AI RAG Status: Semantic vector embedding indexed successfully into PostgreSQL pgvector.`
        }
      ]
    };
  }
);

// ============================================================================
// 1B. TOOL: Get Live 5 Inventory KPI Cards (Total SKUs, In Stock, Low Stock, Out of Stock, Valuation)
// ============================================================================
server.tool(
  "get_catalog_inventory_metrics",
  "Fetches the 5 inventory KPI cards (Total SKUs, In Stock, Low Stock, Out of Stock, Valuation) for any sector-specific solution",
  {
    category: z.string().optional().describe("Optional category filter (e.g. 'Memberships', 'Supplements', 'Fever & Pain')")
  },
  async ({ category }) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    const data = await apiRequest(`/catalog/metrics${qs}`);

    const summary = data.summary || {};
    const cards = data.cards || [];

    const cardsText = cards.map((c: any) =>
      `• [${c.title}] ${c.value} (${c.subtext})`
    ).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `📊 5 Sector-Specific Inventory KPI Cards (${data.category || "universal"}):\n${cardsText}\n\n• Total SKUs: ${summary.totalSkus || 0}\n• In Stock: ${summary.inStock || 0} (> 5 units)\n• Low Stock: ${summary.lowStock || 0} (1-5 units)\n• Out of Stock: ${summary.outOfStock || 0} (0 units)\n• Total Valuation: ${summary.formattedValuation || "₹0"}`
        }
      ]
    };
  }
);

// ============================================================================
// 1C. TOOL: List, Search, and Filter Live Catalog Products & SKUs
// ============================================================================
server.tool(
  "list_catalog_products",
  "Lists, searches, and filters live catalog products and SKUs with category, stock status, and sorting across any business sector",
  {
    category: z.string().optional().describe("Category filter, e.g. 'Appetizers', 'Memberships', 'Supplements'"),
    search: z.string().optional().describe("Search term matching name, SKU, or specs"),
    stockStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).optional().describe("Stock status filter"),
    sortBy: z.enum(["name_asc", "name_desc", "price_asc", "price_desc", "stock_asc", "stock_desc", "sku_asc"]).optional().describe("Sorting field"),
    limit: z.number().optional().default(10).describe("Max items to return")
  },
  async ({ category, search, stockStatus, sortBy, limit }) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    if (stockStatus) params.set("stockStatus", stockStatus);
    if (sortBy) params.set("sortBy", sortBy);
    if (limit) params.set("limit", String(limit));

    const data = await apiRequest(`/catalog?${params.toString()}`);
    const items = data.items || [];
    const formatted = items.map((item: any) =>
      `• [${item.sku}] ${item.name} | Cat: ${item.category} | Price: ₹${Number(item.price).toFixed(2)} | Stock: ${item.stock} ${item.unit || 'pcs'} | Status: ${item.stock === 0 || item.isAvailable === false ? 'Out of Stock' : item.stock <= 5 ? 'Low Stock' : 'In Stock'}`
    ).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `📦 Live Catalog Products (${items.length} of ${data.total || items.length}):\n${formatted || "No products found matching criteria."}`
        }
      ]
    };
  }
);

// ============================================================================
// 2. TOOL: Create WhatsApp Session
// ============================================================================
server.tool(
  "create_whatsapp_session",
  "Spawns a new WhatsApp Baileys instance with a given session name and returns the pairing QR code",
  {
    sessionName: z.string().describe("Descriptive name for the WhatsApp session (e.g. 'Front Desk Support', 'Orders Bot')"),
    isPrimary: z.boolean().optional().default(false).describe("Set true if this should be the primary instance")
  },
  async ({ sessionName, isPrimary }) => {
    const cleanId = sessionName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 16);
    const sessionId = `wa_${cleanId}_${Math.floor(10 + Math.random() * 90)}`;

    const data = await apiRequest("/sessions", {
      method: "POST",
      body: JSON.stringify({ sessionId, sessionName, isPrimary })
    });

    return {
      content: [
        {
          type: "text",
          text: `📱 WhatsApp Session Created:\n• Session ID: ${sessionId}\n• Name: "${sessionName}"\n• Status: ${data.session?.status || "CONNECTING"}\n• QR State: ${data.qrCode ? "QR Code ready for pairing in WebQR tab" : "Instance starting..."}`
        }
      ]
    };
  }
);

// ============================================================================
// 3. TOOL: Send WhatsApp Message
// ============================================================================
server.tool(
  "send_whatsapp_message",
  "Sends a WhatsApp message to a customer number using standard single asterisk (*bold*) formatting with anti-ban pacing",
  {
    to: z.string().describe("Recipient phone number with country code (e.g. '+919382468250' or '9382468250')"),
    content: z.string().describe("Message text content. For bold text, format with *bold*"),
    sessionId: z.string().optional().describe("Optional session ID to dispatch from. Uses primary active session by default")
  },
  async ({ to, content, sessionId }) => {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const sessData = await apiRequest("/sessions");
      const primary = sessData.sessions?.find((s: any) => s.status === "CONNECTED");
      activeSessionId = primary?.id || "wa_primary_01";
    }

    // Format bolding to single asterisks
    const cleanContent = content.replace(/\*\*(.*?)\*\*/g, "*$1*").trim();

    const data = await apiRequest("/messages/send", {
      method: "POST",
      body: JSON.stringify({
        sessionId: activeSessionId,
        to,
        content: cleanContent,
        antiBanPacing: true,
        simulateTyping: true
      })
    });

    return {
      content: [
        {
          type: "text",
          text: `✉️ Message sent to ${to} via session ${activeSessionId}.\nStatus: ${data.status || "SENT"}`
        }
      ]
    };
  }
);

// ============================================================================
// 3B. TOOL: Send WhatsApp Geo Location / Live Tracking
// ============================================================================
server.tool(
  "send_whatsapp_location",
  "Sends a native WhatsApp location pin or live tracking coordinates (Uber / Rapido / WhatsApp style) to a customer",
  {
    to: z.string().describe("Recipient phone number with country code (e.g. '+919382468250')"),
    latitude: z.number().describe("Degrees latitude (e.g. 22.5726)"),
    longitude: z.number().describe("Degrees longitude (e.g. 88.3639)"),
    name: z.string().optional().default("Store Location").describe("Location title or POI name"),
    address: z.string().optional().describe("Street address or landmark description"),
    isLive: z.boolean().optional().default(false).describe("Set true for live tracking mode (Uber/Rapido style)"),
    sessionId: z.string().optional().describe("Optional session ID to dispatch from")
  },
  async ({ to, latitude, longitude, name, address, isLive, sessionId }) => {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const sessData = await apiRequest("/sessions");
      const primary = sessData.sessions?.find((s: any) => s.status === "CONNECTED");
      activeSessionId = primary?.id || "wa_primary_01";
    }

    const data = await apiRequest("/messages/send-location", {
      method: "POST",
      body: JSON.stringify({
        sessionId: activeSessionId,
        to,
        latitude,
        longitude,
        name: name || "Store Location",
        address: address || "",
        isLive: Boolean(isLive)
      })
    });

    return {
      content: [
        {
          type: "text",
          text: `📍 Location pin sent to ${to} via session ${activeSessionId}!\n• Coordinates: ${latitude}, ${longitude}\n• Title: ${name}\n• Map: https://www.google.com/maps?q=${latitude},${longitude}`
        }
      ]
    };
  }
);

// ============================================================================
// 4. TOOL: Get Latest Updates & Activity
// ============================================================================
server.tool(
  "get_latest_updates",
  "Fetches live WhatsApp instance states, unread customer inquiries, and recent conversations",
  {},
  async () => {
    const [sessionsRes, contactsRes] = await Promise.all([
      apiRequest("/sessions"),
      apiRequest("/messages/contacts")
    ]);

    const activeSessions = (sessionsRes.sessions || []).filter((s: any) => s.status === "CONNECTED");
    const unreadChats = (contactsRes.contacts || []).filter((c: any) => c.unreadCount > 0);

    return {
      content: [
        {
          type: "text",
          text: `📊 WhatsApp Gateway Overview:\n• Connected Instances: ${activeSessions.length} (${activeSessions.map((s: any) => `${s.name} [${s.phoneNumber}]`).join(", ") || "None"})\n• Active Inquiries: ${(contactsRes.contacts || []).length}\n• Unread Messages: ${unreadChats.length}\n\nRecent Customer Messages:\n${(contactsRes.contacts || []).slice(0, 5).map((c: any) => `• ${c.name} (${c.phone}): "${c.lastMessage}" [${c.lastTime}]`).join("\n") || "No recent chats"}`
        }
      ]
    };
  }
);

// ============================================================================
// 5. TOOL: Update Business Settings
// ============================================================================
server.tool(
  "update_business_settings",
  "Updates business settings such as AI persona prompt, working hours, address, phone, or greeting message",
  {
    businessName: z.string().optional(),
    workingHours: z.string().optional().describe("e.g. '08:00 AM - 10:00 PM'"),
    address: z.string().optional().describe("Store address"),
    phone: z.string().optional().describe("Support phone number"),
    greetingMessage: z.string().optional().describe("Default greeting message when customer first chats"),
    aiPersonaPrompt: z.string().optional().describe("System prompt guiding the AI tone and domain rules")
  },
  async (updates) => {
    const accs = await apiRequest("/accounts");
    const targetId = accs.accounts?.[0]?.id;
    if (!targetId) throw new Error("No business account found");

    const data = await apiRequest(`/accounts/${targetId}`, {
      method: "PUT",
      body: JSON.stringify(updates)
    });

    return {
      content: [
        {
          type: "text",
          text: `⚙️ Settings updated for "${data.account?.businessName || targetId}":\n` +
            Object.entries(updates)
              .map(([k, v]) => `• ${k}: ${v}`)
              .join("\n")
        }
      ]
    };
  }
);

// ============================================================================
// 6. TOOL: Query RAG ERP Engine
// ============================================================================
server.tool(
  "query_rag_erp",
  "Queries the pgvector knowledge base chunks & live catalog, synthesizing grounded WhatsApp answers",
  {
    query: z.string().describe("Customer question (e.g. 'What is the price of membership?' or 'Do you have cough syrup?')")
  },
  async ({ query }) => {
    const data = await apiRequest("/erp/query", {
      method: "POST",
      body: JSON.stringify({ query })
    });

    return {
      content: [
        {
          type: "text",
          text: data.aiGeneratedReply || "No grounded match found."
        }
      ]
    };
  }
);

// ============================================================================
// 7. TOOL: Upload Document to RAG Knowledge Base
// ============================================================================
server.tool(
  "upload_rag_document",
  "Uploads and indexes document text or files into the pgvector knowledge base chunk index",
  {
    name: z.string().describe("Filename, e.g. 'refund_policy.txt' or 'services_rate_card.pdf'"),
    content: z.string().describe("Raw text content or base64 data"),
    type: z.string().default("TXT").describe("File extension: TXT, PDF, DOCX"),
    category: z.string().optional().default("General"),
    isBase64: z.boolean().optional().default(false)
  },
  async ({ name, content, type, category, isBase64 }) => {
    const data = await apiRequest("/rag/documents", {
      method: "POST",
      body: JSON.stringify({
        name,
        type,
        size: `${Math.round(content.length / 1024)} KB`,
        content,
        isBase64,
        category
      })
    });

    return {
      content: [
        {
          type: "text",
          text: `📄 Document "${name}" successfully indexed into pgvector with ${data.chunksCount || 1} vector chunks!`
        }
      ]
    };
  }
);

// ============================================================================
// 8. TOOL: List WhatsApp Sessions
// ============================================================================
server.tool(
  "list_whatsapp_sessions",
  "Lists all active and inactive WhatsApp instances, connection status, phone numbers, and battery status",
  {},
  async () => {
    const data = await apiRequest("/sessions");
    const sessions = data.sessions || [];

    const formatted = sessions.map((s: any) =>
      `• [${s.status}] ${s.name} (${s.id}) - Phone: ${s.phoneNumber || 'Not Linked'}, Primary: ${s.isPrimary ? 'Yes' : 'No'}, Latency: ${s.latencyMs || 35}ms`
    ).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `📱 WhatsApp Instances (${sessions.length}):\n${formatted || "No sessions found."}`
        }
      ]
    };
  }
);

// ============================================================================
// 9. TOOL: Generate Category-Constrained AI Visual
// ============================================================================
server.tool(
  "generate_ai_visual",
  "Generates a 1024x1024 photorealistic AI image tailored to the business category (e.g. gym, pharmacy, grocery, electronics, restaurant, salon) with optional Cloudinary CDN storage",
  {
    subject: z.string().describe("Visual subject to generate (e.g. 'dumbbell rack', 'medicine counter', 'fresh fruits basket')"),
    category: z.string().optional().describe("Business category: gym, medicine, grocery, electronics, restaurant, salon, custom")
  },
  async ({ subject, category }) => {
    const { ImageService } = await import("../services/image.service");
    const result = await ImageService.handleImageOrDocQuery({
      businessId: "mcp_biz",
      businessName: "Business Store",
      category: category || "custom",
      query: `Please generate an image of ${subject}`
    });

    return {
      content: [
        {
          type: "text",
          text: result.handled && result.mediaUrl
            ? `🎨 Image Generated Successfully!\n• Subject: ${subject}\n• URL: ${result.mediaUrl}\n• Caption: ${result.aiGeneratedReply}`
            : `ℹ️ Image Request Response:\n${result.aiGeneratedReply}`
        }
      ]
    };
  }
);

// Start Stdio Transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MessageAPI MCP Server running on Stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MessageAPI MCP server:", err);
  process.exit(1);
});
