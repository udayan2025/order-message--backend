import path from 'path';
import fs from 'fs';
import { RagService } from './rag.service';
import { prisma } from '../config/database';
import { ENV } from '../config/env';
import { ImageService, CATEGORY_VISUAL_PROFILES } from './image.service';

export interface ErpCatalogItem {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  inStock: boolean;
}

export interface ErpQueryResult {
  matched: boolean;
  items: ErpCatalogItem[];
  matchedProduct?: any;
  aiGeneratedReply: string;
  mediaUrl?: string;
  imageBuffer?: Buffer;
  pdfBuffer?: Buffer;
  fileName?: string;
  messageType?: 'text' | 'image' | 'document';
}

export class ErpService {
  /**
   * Queries the VectorDB (pgvector catalog embeddings & document chunks) and synthesizes
   * an intelligent WhatsApp response starting with an AI greeting & contextual question,
   * followed by grounded RAG retrieved information, and closing with next steps.
   */
  public static async queryErp(params: {
    businessId: string;
    query: string;
  }): Promise<ErpQueryResult> {
    const { businessId, query } = params;
    const lowerQuery = query.toLowerCase().trim();

    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    }) || await prisma.businessAccount.findFirst();

    if (!business) {
      throw new Error('Business account not found');
    }

    const currency = business.currency || '₹';
    const bizCategory = (business.category || 'custom').toLowerCase();
    const isGym = bizCategory === 'gym' || business.businessName.toLowerCase().includes('gym') || business.businessName.toLowerCase().includes('fit');
    const isPharma = bizCategory === 'medicine' || bizCategory === 'pharmacy' || business.businessName.toLowerCase().includes('pharma') || business.businessName.toLowerCase().includes('apollo') || business.businessName.toLowerCase().includes('med');
    const isGrocery = bizCategory === 'grocery' || bizCategory === 'supermarket' || business.businessName.toLowerCase().includes('mart') || business.businessName.toLowerCase().includes('fresh') || business.businessName.toLowerCase().includes('grocery');
    const isElectronics = bizCategory === 'electronics' || bizCategory === 'tech' || business.businessName.toLowerCase().includes('tech') || business.businessName.toLowerCase().includes('gadget') || business.businessName.toLowerCase().includes('electronics');
    const isRestaurant = bizCategory === 'restaurant' || bizCategory === 'cafe' || bizCategory === 'food' || business.businessName.toLowerCase().includes('cafe') || business.businessName.toLowerCase().includes('bistro') || business.businessName.toLowerCase().includes('restaurant');
    const isSalon = bizCategory === 'salon' || bizCategory === 'spa' || bizCategory === 'beauty' || business.businessName.toLowerCase().includes('salon') || business.businessName.toLowerCase().includes('spa');

    // Check if query is a greeting
    const isGreeting =
      /^(hi|hello|hey|namaste|hlo|heya|hola|good morning|good afternoon|good evening|start|hi there|hello there)[!.\s]*$/i.test(lowerQuery) ||
      ((/^(hi|hello|hey|namaste)\b/i.test(lowerQuery) || /^(hlo|heya)\b/i.test(lowerQuery)) && lowerQuery.split(/\s+/).length <= 2);

    if (isGreeting) {
      const dynamicGreeting = (business.greetingMessage || `Hello! Welcome to ${business.businessName}! How can we assist you today?`)
        .replace(/{BusinessName}/g, business.businessName)
        .replace(/\*\*(.*?)\*\*/g, '*$1*')
        .trim();
      return {
        matched: true,
        items: [],
        aiGeneratedReply: dynamicGreeting
      };
    }

    // 1. Fetch live catalog items from database for this specific business
    const dbCatalogItems = await prisma.catalogItem.findMany({
      where: { businessId: business.id },
      orderBy: { name: 'asc' }
    });

    // Safely map Prisma Decimal prices to numbers for Image / Doc processing
    const mappedCatalogItems = dbCatalogItems.map((item) => ({
      name: item.name,
      category: item.category,
      price: typeof item.price?.toNumber === 'function' ? item.price.toNumber() : Number(item.price)
    }));

    // Check if query is an Image or Document generation request
    const imageDocResult = await ImageService.handleImageOrDocQuery({
      businessId: business.id,
      businessName: business.businessName,
      category: business.category,
      query,
      catalogItems: mappedCatalogItems,
      currency
    });

    if (imageDocResult.handled) {
      return {
        matched: true,
        items: [],
        aiGeneratedReply: imageDocResult.aiGeneratedReply,
        mediaUrl: imageDocResult.mediaUrl,
        imageBuffer: imageDocResult.imageBuffer,
        pdfBuffer: imageDocResult.pdfBuffer,
        fileName: imageDocResult.fileName,
        messageType: imageDocResult.messageType || 'text'
      };
    }

    const distinctCategories = Array.from(
      new Set(dbCatalogItems.map((item) => item.category?.trim()).filter(Boolean))
    );

    // Intent checks
    const isHoursQuery = /\b(time|timing|timings|open|close|hours|schedule|operating hours)\b/i.test(lowerQuery);
    const isLocationQuery = /\b(address|location|where|map|shop location|store location)\b/i.test(lowerQuery);
    const isStockQuery = /\b(stock|stocks|inventory|available|availability|units left|in stock|stock details|items available|how many|units left|qty|quantity|left in stock|how much stock|catalog|products|items|menu|list|options)\b/i.test(lowerQuery);

    // Check if query specifies one of the business's categories
    const matchedCategory = distinctCategories.find((cat) => {
      const c = cat.toLowerCase();
      return lowerQuery === c || lowerQuery.includes(c) || c.split(/\s+/).some((w) => w.length >= 4 && lowerQuery.includes(w));
    });

    // Check if query mentions any product name, brand, or SKU in the Product Catalog
    const matchedProduct = ErpService.findMatchingCatalogItem(query, dbCatalogItems);

    // FEATURE: If anyone messages about any product or anything existing in Product Catalog & SKU Management,
    // show ALL product details (Name, Brand, SKU, Category, Price, Stock & Unit, Specs) and add BUY button!
    if (matchedProduct) {
      const productReply = ErpService.formatProductCatalogReply(matchedProduct, business, currency);

      let imageBuffer: Buffer | undefined;
      let mediaUrl: string | undefined = matchedProduct.imageUrl || undefined;

      if (mediaUrl) {
        if (mediaUrl.startsWith('data:image/')) {
          const commaIdx = mediaUrl.indexOf(',');
          if (commaIdx !== -1) {
            try {
              imageBuffer = Buffer.from(mediaUrl.slice(commaIdx + 1), 'base64');
            } catch (err: any) {
              console.warn('Failed to parse base64 image:', err.message);
            }
          }
        } else if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('uploads/')) {
          const filename = path.basename(mediaUrl);
          const localPath = path.join(ENV.UPLOAD_DIR, filename);
          if (fs.existsSync(localPath)) {
            try {
              imageBuffer = fs.readFileSync(localPath);
            } catch (err: any) {
              console.warn('Failed to read local image:', err.message);
            }
          }
        }
      }

      // If product has no stored image, generate an on-topic visual photo from Pollinations
      if (!imageBuffer && !mediaUrl) {
        try {
          const catKey = (business?.category || 'custom').toLowerCase();
          const profile = CATEGORY_VISUAL_PROFILES[catKey] || CATEGORY_VISUAL_PROFILES.custom;
          const prompt = profile.promptEnhancer(matchedProduct.name, business.businessName);
          const pollUrl = ImageService.buildPollinationsUrl(prompt);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          const imgRes = await fetch(pollUrl, { signal: controller.signal });
          clearTimeout(timer);

          if (imgRes.ok) {
            const arrBuf = await imgRes.arrayBuffer();
            imageBuffer = Buffer.from(arrBuf);
            mediaUrl = pollUrl;
          }
        } catch {
          // Graceful fallback to text
        }
      }

      const hasValidImage = Boolean(imageBuffer && imageBuffer.length > 0) || Boolean(mediaUrl && mediaUrl.startsWith('http'));

      return {
        matched: true,
        matchedProduct: {
          id: matchedProduct.id,
          sku: matchedProduct.sku,
          name: matchedProduct.name,
          brand: matchedProduct.brand,
          category: matchedProduct.category,
          price: typeof matchedProduct.price?.toNumber === 'function' ? matchedProduct.price.toNumber() : Number(matchedProduct.price),
          stock: matchedProduct.stock,
          unit: matchedProduct.unit,
          description: matchedProduct.description,
          imageUrl: matchedProduct.imageUrl,
          isAvailable: matchedProduct.isAvailable
        },
        items: dbCatalogItems.map((item) => ({
          sku: item.sku,
          name: item.name,
          category: item.category,
          price: typeof item.price?.toNumber === 'function' ? item.price.toNumber() : Number(item.price),
          stock: item.stock,
          unit: item.unit,
          inStock: item.stock > 0
        })),
        aiGeneratedReply: productReply,
        mediaUrl,
        imageBuffer,
        messageType: hasValidImage ? 'image' : 'text'
      };
    }

    // 2. VECTOR DB RETRIEVAL (Knowledge Base Document Chunks via pgvector)
    let docMatches: any[] = [];
    try {
      const kbResult = await RagService.queryKnowledgeBase({
        businessId: business.id,
        query,
        limit: 3
      });
      docMatches = kbResult.retrievedChunks || [];
    } catch (err: any) {
      console.warn('Doc chunks retrieval warning:', err.message);
    }
    const topDocMatch = docMatches.find((d) => d.similarity > 0.45) || docMatches[0];

    let synthesizedReply = '';

    // =========================================================================
    // BRANCH A: USER EXPLICITLY ASKS ABOUT STOCK / INVENTORY
    // =========================================================================
    if (isStockQuery || matchedCategory) {
      // Case 1: General stock query without specifying a category or product
      // e.g. "i want stock details", "what stock do you have?", "check stock"
      if (!matchedCategory && !matchedProduct) {
        if (dbCatalogItems.length === 0) {
          synthesizedReply = `Currently, no stock is available now.. we will update soon! Please feel free to ask about our timings or contact our front desk at *${business.phone}*.`;
        } else {
          // Professionally ask which category they want to choose from
          const catList = distinctCategories.map((c) => `• *${c}*`).join('\n');
          synthesizedReply = `Hello! We have live inventory available across several categories at *${business.businessName}*:\n\n${catList}\n\nWhich category would you like to check stock details for? Simply reply with the category name!`;
        }
      }
      // Case 2: User specifies a category (e.g. "supplements", "memberships", "medicines")
      else if (matchedCategory) {
        const catItems = dbCatalogItems.filter(
          (i) => i.category.toLowerCase() === matchedCategory.toLowerCase() ||
                 i.category.toLowerCase().includes(matchedCategory.toLowerCase()) ||
                 matchedCategory.toLowerCase().includes(i.category.toLowerCase())
        );

        const inStockItems = catItems.filter((i) => i.stock > 0);

        if (catItems.length === 0 || inStockItems.length === 0) {
          synthesizedReply = `Currently, no stock is available in *${matchedCategory}*.. we will update soon! Please let us know if you would like to explore our other categories or check back shortly.`;
        } else {
          // Provide 4-5 products according to that category with live price and stock
          const top4to5 = inStockItems.slice(0, 5);
          const productListText = top4to5.map((item, idx) => {
            return `${idx + 1}. *${item.name}* (\`${item.sku}\`)\n   • Price: *${currency}${Number(item.price).toFixed(2)}*${item.unit && item.unit !== 'pcs' ? ` / ${item.unit}` : ''}\n   • Stock: *${item.stock} ${item.unit} available* (✅ In Stock)${item.description ? `\n   • Info: ${item.description}` : ''}`;
          }).join('\n\n');

          synthesizedReply = `📦 *Live Stock Details for ${matchedCategory} at ${business.businessName}:*\n\n${productListText}\n\nWould you like to place an order or check details for another category?`;
        }
      }
      // Case 3: User specifies a particular product (e.g. "do you have dolo 650 in stock?", "whey protein stock")
      else if (matchedProduct) {
        if (matchedProduct.stock > 0) {
          synthesizedReply = `✅ *${matchedProduct.name}* (\`${matchedProduct.sku}\`) is in stock!\n• Category: *${matchedProduct.category}*\n• Price: *${currency}${Number(matchedProduct.price).toFixed(2)}*${matchedProduct.unit && matchedProduct.unit !== 'pcs' ? ` / ${matchedProduct.unit}` : ''}\n• Available Stock: *${matchedProduct.stock} ${matchedProduct.unit}*\n${matchedProduct.description ? `• Details: ${matchedProduct.description}\n` : ''}Would you like to place an order? Please reply with your desired quantity to proceed!`;
        } else {
          synthesizedReply = `⚠️ *${matchedProduct.name}* (\`${matchedProduct.sku}\`) is currently out of stock.. we will update soon! Would you like us to notify you when it arrives?`;
        }
      } else {
        // Stock query but item not in database
        synthesizedReply = `We could not find that item in our current inventory at *${business.businessName}*. No stock is available now.. we will update soon! Please feel free to check our other categories or reach our team at *${business.phone}*.`;
      }
    }
    // =========================================================================
    // BRANCH B: HOURS OR LOCATION INQUIRIES
    // =========================================================================
    else if (isHoursQuery) {
      synthesizedReply = `🕒 *Operating Hours for ${business.businessName}:*\nWe are open *${business.workingHours}*.\nFeel free to drop by or contact our front desk at *${business.phone}*!`;
    } else if (isLocationQuery) {
      synthesizedReply = `📍 *Store Location:* ${business.businessName}\n${business.address || 'Central Road'}\n📞 Front Desk: *${business.phone}*\nHow can I assist you today?`;
    }
    // =========================================================================
    // BRANCH C: GENERAL INQUIRIES (DO NOT GIVE STOCK DETAILS UNPROMPTED)
    // =========================================================================
    else {
      // Check RAG Knowledge Base first
      const docContextText = docMatches.length > 0
        ? docMatches.map((d, idx) => `[Source ${idx + 1} (${d.docName})]: ${d.text}`).join('\n\n')
        : 'No specific knowledge base document chunks found.';

      if (ENV.GROQ_API_KEY) {
        try {
          const groqModel = ENV.GROQ_LLM_MODEL || 'openai/gpt-oss-120b';
          const systemPrompt = `You are the official WhatsApp AI Assistant for "${business.businessName}".
Your System Persona: "${business.aiPersonaPrompt}".
Your Business Greeting: "${business.greetingMessage}".

CONVERSATION & RESPONSE GUIDELINES:
1. NATURAL & CONCISE WHATSAPP TONE:
   - Speak warmly, helpfully, and professionally like a real team member chatting with a customer on WhatsApp.
   - Answer the customer's specific question directly.
2. STOCK RULES (STRICT):
   - The customer DID NOT ask for stock or inventory counts.
   - NEVER mention remaining units, stock quantities, or warehouse numbers unless the customer explicitly asks for stock.
   - Just explain the features, benefits, prices, timings, or service details naturally.
3. TIMINGS & STORE INFO:
   - Hours: ${business.workingHours}
   - Address: ${business.address || 'our store location'}
   - Phone: ${business.phone}
   - Currency: ${currency}
4. FORMATTING:
   - Strictly use single asterisks for bold (*text*), NEVER use double asterisks (**text**).
   - Keep answers brief and conversational (1-2 short paragraphs max).`;

          const userPrompt = `Customer Question: "${query}"

[Retrieved Knowledge Base Documents]:
${docContextText}

Please generate a helpful and concise WhatsApp response.`;

          let groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: groqModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.3,
              max_tokens: 350
            })
          });

          if (!groqRes.ok) {
            groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 350
              })
            });
          }

          if (groqRes.ok) {
            const data = await groqRes.json();
            synthesizedReply = data.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (err: any) {
          console.warn('Groq synthesis notice:', err.message);
        }
      }

      if (!synthesizedReply) {
        if (topDocMatch && topDocMatch.similarity > 0.45) {
          synthesizedReply = `📄 *Information from ${business.businessName}:*\n${topDocMatch.text}\n\nLet me know if you would like more details!`;
        } else if (matchedProduct) {
          synthesizedReply = `📦 *${matchedProduct.name}*\n• Price: *${currency}${Number(matchedProduct.price).toFixed(2)}*${matchedProduct.unit && matchedProduct.unit !== 'pcs' ? ` / ${matchedProduct.unit}` : ''}\n${matchedProduct.description ? `• Details: ${matchedProduct.description}\n` : ''}Would you like more details or help getting started?`;
        } else {
          const welcome = business.greetingMessage
            ? business.greetingMessage.replace(/{BusinessName}/g, business.businessName)
            : `Thank you for contacting *${business.businessName}*! 👋`;
          synthesizedReply = `${welcome}\n\nHow can I assist you with our services, plans, or timings today?`;
        }
      }
    }

    // Ensure final reply strictly uses single asterisks for WhatsApp bold
    const finalReply = synthesizedReply
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/^---+$/gm, '')
      .trim();

    return {
      matched: true,
      items: dbCatalogItems.map((item) => ({
        sku: item.sku,
        name: item.name,
        category: item.category,
        price: typeof item.price?.toNumber === 'function' ? item.price.toNumber() : Number(item.price),
        stock: item.stock,
        unit: item.unit,
        inStock: item.stock > 0
      })),
      aiGeneratedReply: finalReply
    };
  }

  /**
   * High-accuracy matcher that finds a catalog item matching the user's inquiry
   * by checking SKU, Product Name, Brand, Category, and specifications/keywords.
   */
  public static findMatchingCatalogItem(query: string, items: any[]): any | null {
    if (!query || !items || items.length === 0) return null;
    const cleanQuery = query.toLowerCase().trim();

    // 1. Direct exact or partial SKU match
    const exactSku = items.find((item) => {
      const s = (item.sku || '').toLowerCase().trim();
      return s && (cleanQuery === s || cleanQuery.includes(s) || cleanQuery.replace(/[^a-z0-9]/g, '').includes(s.replace(/[^a-z0-9]/g, '')));
    });
    if (exactSku) return exactSku;

    // 2. Direct exact full name match
    const exactName = items.find((item) => {
      const n = (item.name || '').toLowerCase().trim();
      return n && (cleanQuery === n || cleanQuery.includes(n));
    });
    if (exactName) return exactName;

    // 3. Tokenized relevance scoring
    const queryTokens = cleanQuery
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    const stopWords = new Set([
      'what', 'whats', 'is', 'the', 'price', 'of', 'for', 'cost', 'rate', 'how', 'much',
      'do', 'you', 'have', 'any', 'things', 'thing', 'exist', 'in', 'your', 'catalog', 'stock',
      'inventory', 'available', 'availability', 'tell', 'me', 'about', 'details', 'give', 'show',
      'can', 'i', 'get', 'buy', 'purchase', 'order', 'please', 'need', 'want', 'looking', 'item',
      'product', 'products', 'items', 'with', 'and', 'are', 'there', 'this', 'that', 'from',
      'menu', 'ratecard', 'card', 'option', 'options', 'spec', 'specs', 'specification'
    ]);

    const meaningfulQueryTokens = queryTokens.filter((t) => !stopWords.has(t));

    let bestMatch: any = null;
    let highestScore = 0;

    for (const item of items) {
      let score = 0;
      const nameLower = (item.name || '').toLowerCase();
      const skuLower = (item.sku || '').toLowerCase();
      const brandLower = (item.brand || '').toLowerCase();
      const catLower = (item.category || '').toLowerCase();
      const descLower = (item.description || '').toLowerCase();

      // Check meaningful tokens against fields
      if (meaningfulQueryTokens.length > 0) {
        let matchedCount = 0;
        for (const token of meaningfulQueryTokens) {
          if (nameLower.includes(token)) {
            matchedCount += 2;
          } else if (brandLower && brandLower.includes(token)) {
            matchedCount += 2;
          } else if (skuLower.includes(token)) {
            matchedCount += 2;
          } else if (descLower.includes(token)) {
            matchedCount += 1;
          } else if (catLower.includes(token)) {
            matchedCount += 0.5;
          }
        }

        const matchRatio = matchedCount / (meaningfulQueryTokens.length * 2);
        if (matchRatio >= 0.35) {
          score += Math.round(matchRatio * 75);
        }
      }

      // Check product name keywords
      const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w));
      if (nameWords.length > 0) {
        const matchedNameWords = nameWords.filter((w: string) => cleanQuery.includes(w));
        if (matchedNameWords.length > 0) {
          score += Math.round((matchedNameWords.length / nameWords.length) * 35);
        }
      }

      // Brand match bonus
      if (brandLower && cleanQuery.includes(brandLower)) {
        score += 20;
      }

      if (score > highestScore && score >= 25) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch;
  }

  /**
   * Formats a complete, production-grade product reply displaying all details
   * (Name, Brand, SKU, Category, Price, Stock & Unit status, Specs) and the Buy Now button metadata.
   */
  public static formatProductCatalogReply(item: any, business: any, currency: string): string {
    const priceNum = typeof item.price?.toNumber === 'function' ? item.price.toNumber() : Number(item.price);
    const formattedPrice = `${currency}${priceNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const unitSuffix = item.unit && item.unit.toLowerCase() !== 'pcs' ? ` / ${item.unit}` : '';
    const isAvailable = item.isAvailable !== false && item.stock > 0;

    let stockBadge = '';
    if (!item.isAvailable || item.stock === 0) {
      stockBadge = '❌ *Availability:* Currently Out of Stock (Backorder available)';
    } else if (item.stock <= 5) {
      stockBadge = `⚠️ *Availability:* Limited Stock! Only *${item.stock} ${item.unit} left* in stock`;
    } else {
      stockBadge = `✅ *Availability:* In Stock (*${item.stock} ${item.unit} ready* for immediate dispatch)`;
    }

    const brandPart = item.brand ? `• 🏷️ *Brand:* ${item.brand}\n` : '';
    const descPart = item.description ? `• 📝 *Specifications & Features:*\n   ${item.description}\n` : '';

    const buyPayload = JSON.stringify({
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand || undefined,
      category: item.category,
      price: priceNum,
      stock: item.stock,
      unit: item.unit,
      currency,
      imageUrl: item.imageUrl || undefined,
      description: item.description || undefined,
      isAvailable
    });

    const cleanPhone = (business?.phone || '').replace(/[^0-9]/g, '');
    const waOrderLink = cleanPhone
      ? `\n🔗 *Instant 1-Tap Order Link:*\nhttps://wa.me/${cleanPhone}?text=BUY%20${encodeURIComponent(item.sku)}`
      : '';

    return `📦 *${item.name}*

• 🏷️ *Brand:* ${item.brand || 'Original Store'}
• 🔢 *SKU Code:* \`${item.sku}\`
• 📁 *Category:* ${item.category}
• 💰 *Price:* *${formattedPrice}*${unitSuffix}
• 📊 ${stockBadge}
${descPart}
───────────────
🛒 *How to Buy / Order:*
👉 Reply with *BUY ${item.sku}* to order immediately!${waOrderLink}

[BUY_PRODUCT:${buyPayload}]`;
  }
}
