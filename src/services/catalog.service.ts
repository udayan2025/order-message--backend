import { prisma } from '../config/database';
import { RagService } from './rag.service';
import { ENV } from '../config/env';
import zlib from 'zlib';
import * as xlsx from 'xlsx';

export class CatalogService {
  public static async getCatalog(
    businessId: string,
    categoryOrOptions?: string | {
      category?: string;
      search?: string;
      stockStatus?: string;
      sortBy?: string;
      page?: number;
      limit?: number;
    },
    legacySearch?: string
  ): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    let category: string | undefined;
    let search: string | undefined;
    let stockStatus: string | undefined;
    let sortBy: string | undefined = 'name_asc';
    let page: number | undefined;
    let limit: number | undefined;

    if (typeof categoryOrOptions === 'object' && categoryOrOptions !== null) {
      category = categoryOrOptions.category;
      search = categoryOrOptions.search;
      stockStatus = categoryOrOptions.stockStatus;
      sortBy = categoryOrOptions.sortBy || 'name_asc';
      page = categoryOrOptions.page;
      limit = categoryOrOptions.limit;
    } else {
      category = categoryOrOptions;
      search = legacySearch;
    }

    const where: any = { businessId };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } }
      ];
    }

    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'in_stock') {
        where.stock = { gt: 5 };
        where.isAvailable = { not: false };
      } else if (stockStatus === 'low_stock') {
        where.stock = { gt: 0, lte: 5 };
        where.isAvailable = { not: false };
      } else if (stockStatus === 'out_of_stock') {
        where.OR = [
          ...(where.OR || []),
          { stock: { lte: 0 } },
          { isAvailable: false }
        ];
      }
    }

    // Build orderBy
    let orderBy: any = { name: 'asc' };
    switch (sortBy) {
      case 'name_desc':
        orderBy = { name: 'desc' };
        break;
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      case 'stock_asc':
        orderBy = { stock: 'asc' };
        break;
      case 'stock_desc':
        orderBy = { stock: 'desc' };
        break;
      case 'sku_asc':
        orderBy = { sku: 'asc' };
        break;
      case 'name_asc':
      default:
        orderBy = { name: 'asc' };
        break;
    }

    const total = await prisma.catalogItem.count({ where });

    let items: any[];
    const parsedPage = Math.max(1, page || 1);
    const parsedLimit = limit && limit > 0 ? limit : -1;

    if (parsedLimit > 0) {
      const skip = (parsedPage - 1) * parsedLimit;
      items = await prisma.catalogItem.findMany({
        where,
        orderBy,
        skip,
        take: parsedLimit
      });
    } else {
      items = await prisma.catalogItem.findMany({
        where,
        orderBy
      });
    }

    const totalPages = parsedLimit > 0 ? Math.max(1, Math.ceil(total / parsedLimit)) : 1;

    return {
      items,
      total,
      page: parsedPage,
      limit: parsedLimit > 0 ? parsedLimit : total,
      totalPages
    };
  }

  public static async upsertItem(params: {
    businessId: string;
    sku?: string;
    name: string;
    category?: string;
    brand?: string;
    imageUrl?: string;
    price: number;
    stock?: number;
    unit?: string;
    description?: string;
    isAvailable?: boolean;
  }) {
    let { businessId, sku, name, category, brand, imageUrl, price, stock = 10, unit = 'pcs', description = '', isAvailable = true } = params;

    // Auto-generate clean sector-prefixed SKU if not provided
    if (!sku || !sku.trim()) {
      const biz = await prisma.businessAccount.findUnique({ where: { id: businessId } });
      const sector = (biz?.category || 'custom').toLowerCase();
      const prefixMap: Record<string, string> = {
        medicine: 'MED',
        pharmacy: 'MED',
        gym: 'GYM',
        fitness: 'GYM',
        grocery: 'GRO',
        supermarket: 'GRO',
        electronics: 'TECH',
        restaurant: 'REST',
        cafe: 'REST',
        salon: 'SAL',
        spa: 'SAL',
        custom: 'SKU'
      };
      const prefix = prefixMap[sector] || 'SKU';
      sku = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
    }

    if (!category || !category.trim()) {
      category = 'General';
    }

    const cleanBrand = brand && brand.trim() ? brand.trim() : null;
    const cleanImageUrl = imageUrl && imageUrl.trim() ? imageUrl.trim() : null;

    // Check if item with same sku already exists for this business
    const existing = await prisma.catalogItem.findFirst({
      where: { businessId, sku }
    });

    let savedItem;
    if (existing) {
      savedItem = await prisma.catalogItem.update({
        where: { id: existing.id },
        data: { name, category, brand: cleanBrand, imageUrl: cleanImageUrl, price, stock, unit, description, isAvailable }
      });
    } else {
      savedItem = await prisma.catalogItem.create({
        data: { businessId, sku, name, category, brand: cleanBrand, imageUrl: cleanImageUrl, price, stock, unit, description, isAvailable }
      });
    }

    // Auto-index into pgvector via RagService asynchronously
    RagService.indexCatalogItem({
      id: savedItem.id,
      businessId: savedItem.businessId,
      sku: savedItem.sku,
      name: savedItem.name,
      category: savedItem.category,
      brand: savedItem.brand,
      price: savedItem.price.toString(),
      stock: savedItem.stock,
      unit: savedItem.unit,
      description: savedItem.description
    }).catch((err) => console.error('Failed to auto-index item in pgvector:', err));

    return savedItem;
  }

  public static async bulkUpsert(businessId: string, items: Array<{
    sku: string;
    name: string;
    category: string;
    brand?: string;
    imageUrl?: string;
    price: number;
    stock: number;
    unit?: string;
    description?: string;
    isAvailable?: boolean;
  }>) {
    const results = [];
    for (const item of items) {
      const saved = await CatalogService.upsertItem({
        businessId,
        ...item
      });
      results.push(saved);
    }
    return results;
  }

  public static async updateItem(id: string, updates: any) {
    const dataToUpdate: any = {};
    if (updates.name !== undefined) dataToUpdate.name = String(updates.name).trim();
    if (updates.category !== undefined) dataToUpdate.category = String(updates.category).trim();
    if (updates.brand !== undefined) dataToUpdate.brand = updates.brand ? String(updates.brand).trim() : null;
    if (updates.imageUrl !== undefined) dataToUpdate.imageUrl = updates.imageUrl ? String(updates.imageUrl).trim() : null;
    if (updates.sku !== undefined) dataToUpdate.sku = String(updates.sku).trim();
    if (updates.price !== undefined) dataToUpdate.price = parseFloat(updates.price) || 0;
    if (updates.stock !== undefined) dataToUpdate.stock = parseInt(updates.stock, 10) || 0;
    if (updates.unit !== undefined) dataToUpdate.unit = String(updates.unit).trim();
    if (updates.description !== undefined) dataToUpdate.description = String(updates.description).trim();
    if (updates.isAvailable !== undefined) dataToUpdate.isAvailable = Boolean(updates.isAvailable);

    const item = await prisma.catalogItem.update({
      where: { id },
      data: dataToUpdate
    });

    RagService.indexCatalogItem({
      id: item.id,
      businessId: item.businessId,
      sku: item.sku,
      name: item.name,
      category: item.category,
      brand: item.brand,
      price: item.price.toString(),
      stock: item.stock,
      unit: item.unit,
      description: item.description
    }).catch(() => null);

    return item;
  }

  public static async deleteItem(id: string) {
    try {
      await prisma.catalogEmbedding.deleteMany({
        where: { catalogItemId: id }
      });
    } catch {
      // Ignore if table or record does not exist
    }

    return prisma.catalogItem.delete({
      where: { id }
    });
  }

  /**
   * Helper to extract plain text and table lines from raw PDF buffer without external packages
   */
  public static extractTextFromPdfBuffer(buffer: Buffer): string {
    const content = buffer.toString('binary');
    const extractedChunks: string[] = [];

    // Find all stream ... endstream blocks in PDF
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(content)) !== null) {
      const streamContent = match[1];
      let decompressed: Buffer | null = null;
      try {
        const streamBuf = Buffer.from(streamContent, 'binary');
        decompressed = zlib.inflateSync(streamBuf);
      } catch {
        try {
          const streamBuf = Buffer.from(streamContent, 'binary');
          decompressed = zlib.unzipSync(streamBuf);
        } catch {
          // Uncompressed or raw stream
        }
      }

      const textToSearch = decompressed ? decompressed.toString('utf-8') : streamContent;

      // Extract text in Tj operators: (Some text) Tj
      const tjRegex = /\(([^)]+)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textToSearch)) !== null) {
        const clean = tjMatch[1].replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
        extractedChunks.push(clean);
      }

      // Extract text in TJ array operators: [(Part 1) 10 (Part 2)] TJ
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayRegex.exec(textToSearch)) !== null) {
        const inner = tjArrayMatch[1];
        const parts = inner.match(/\(([^)]+)\)/g);
        if (parts) {
          const joined = parts.map((p) => p.slice(1, -1)).join(' ');
          extractedChunks.push(joined);
        }
      }
    }

    // Fallback: Extract all printable ASCII sequences if streams yielded low text
    if (extractedChunks.length < 5) {
      const printable = buffer.toString('utf-8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
      const lines = printable
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2 && !l.startsWith('%') && !l.startsWith('xref') && !l.startsWith('trailer'));
      return lines.join('\n');
    }

    return extractedChunks.join('\n');
  }

  /**
   * Helper to parse Excel (.xlsx, .xls) and CSV (.csv) inventory / price sheets
   */
  public static parseExcelBuffer(
    buffer: Buffer,
    fileName: string,
    defaultCategory: string,
    business: any
  ): Array<{
    name: string;
    sku?: string;
    category?: string;
    price: number;
    stock?: number;
    unit?: string;
    description?: string;
  }> {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const items: Array<any> = [];
    const categoryPrefix = (defaultCategory || business?.category || 'SKU')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4) || 'ITEM';

    let itemCounter = 1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      if (!rows || rows.length === 0) continue;

      for (const row of rows) {
        const findField = (patterns: RegExp[]) => {
          for (const key of Object.keys(row)) {
            const cleanKey = key.trim().toLowerCase();
            for (const p of patterns) {
              if (p.test(cleanKey)) {
                const val = row[key];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  return val;
                }
              }
            }
          }
          return undefined;
        };

        const rawName = findField([
          /^name$/i,
          /^product\s*name$/i,
          /^item\s*name$/i,
          /^item$/i,
          /^product$/i,
          /^title$/i,
          /^item\s*description$/i,
          /^medicine$/i,
          /^equipment$/i,
          /^dish$/i,
          /^service$/i
        ]);

        let name = rawName ? String(rawName).trim() : '';
        if (!name) {
          for (const key of Object.keys(row)) {
            const val = String(row[key] || '').trim();
            if (val.length >= 2 && isNaN(Number(val))) {
              name = val;
              break;
            }
          }
        }

        if (!name) continue;

        if (name.toLowerCase() === 'name' || name.toLowerCase() === 'product name' || name.toLowerCase() === 'item name') {
          continue;
        }

        const rawPrice = findField([
          /^price$/i,
          /^rate$/i,
          /^mrp$/i,
          /^amount$/i,
          /^cost$/i,
          /^selling\s*price$/i,
          /^unit\s*price$/i,
          /price/i,
          /rate/i,
          /mrp/i
        ]);

        let price = 0;
        if (rawPrice !== undefined && rawPrice !== null) {
          const numStr = String(rawPrice).replace(/[^0-9.]/g, '');
          price = parseFloat(numStr) || 0;
        }

        const rawSku = findField([
          /^sku$/i,
          /^item\s*code$/i,
          /^code$/i,
          /^product\s*id$/i,
          /^barcode$/i,
          /^sku\s*code$/i,
          /^id$/i
        ]);

        const sku = rawSku ? String(rawSku).trim() : `${categoryPrefix}-${String(itemCounter + 100).padStart(3, '0')}`;

        const rawCat = findField([
          /^category$/i,
          /^cat$/i,
          /^department$/i,
          /^group$/i,
          /^type$/i
        ]);
        const category = rawCat ? String(rawCat).trim() : (defaultCategory || business?.category || 'General');

        const rawStock = findField([
          /^stock$/i,
          /^qty$/i,
          /^quantity$/i,
          /^available$/i,
          /^count$/i,
          /^units$/i
        ]);
        let stock = 10;
        if (rawStock !== undefined && rawStock !== null) {
          const sNum = parseInt(String(rawStock).replace(/[^0-9]/g, ''), 10);
          if (!isNaN(sNum)) stock = sNum;
        }

        const rawUnit = findField([
          /^unit$/i,
          /^uom$/i,
          /^pack$/i,
          /^package$/i
        ]);
        const unit = rawUnit ? String(rawUnit).trim() : 'pcs';

        const rawDesc = findField([
          /^description$/i,
          /^desc$/i,
          /^details$/i,
          /^specification$/i,
          /^notes$/i
        ]);
        const description = rawDesc ? String(rawDesc).trim() : `Imported from ${fileName}`;

        items.push({
          sku,
          name,
          category,
          price,
          stock,
          unit,
          description
        });

        itemCounter++;
      }
    }

    return items;
  }

  /**
   * Upload and AI-parse a PDF or Excel/CSV catalog / price list document.
   * Extracts product headers (name, sku, category, price, stock, unit, description),
   * maps to database schema, upserts to PostgreSQL for the business account,
   * and auto-indexes into pgvector.
   */
  public static async uploadAndParsePdf(params: {
    businessId: string;
    fileName: string;
    base64Content: string;
    defaultCategory?: string;
  }): Promise<{
    success: boolean;
    count: number;
    totalCount?: number;
    items: Array<any>;
    newItems?: Array<any>;
    message: string;
  }> {
    const { businessId, fileName, base64Content, defaultCategory = 'General' } = params;

    const lowerName = fileName.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv') || base64Content.startsWith('UEsDB');
    const isPdf = lowerName.endsWith('.pdf') || base64Content.startsWith('JVBERi0');

    if (!isExcel && !isPdf) {
      throw new Error('Only PDF (.pdf) and Excel / CSV (.xlsx, .xls, .csv) documents are allowed for catalog import.');
    }

    const business = (await prisma.businessAccount.findUnique({
      where: { id: businessId }
    })) || (await prisma.businessAccount.findFirst());

    if (!business) {
      throw new Error('Business account not found.');
    }

    const buffer = Buffer.from(base64Content, 'base64');
    let parsedItems: Array<{
      name: string;
      sku?: string;
      category?: string;
      price: number;
      stock?: number;
      unit?: string;
      description?: string;
    }> = [];

    const categoryPrefix = (defaultCategory || business.category || 'SKU')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4) || 'ITEM';

    if (isExcel) {
      parsedItems = CatalogService.parseExcelBuffer(buffer, fileName, defaultCategory, business);
      console.log(`📊 [Catalog Excel] Successfully parsed ${parsedItems.length} rows from "${fileName}".`);
    } else {
      const extractedText = CatalogService.extractTextFromPdfBuffer(buffer);
      console.log(`📄 [Catalog PDF] Uploaded "${fileName}" (${buffer.length} bytes). Extracted text length: ${extractedText.length} chars.`);

      // Strategy 1: Use Gemini API directly on PDF inline data if key is available
      if (ENV.GEMINI_API_KEY) {
        try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are an AI Inventory & Catalog Parser for "${business.businessName}".
The uploaded PDF contains an inventory sheet, price list, menu, or product catalog.
Examine the document headers and content carefully. Extract all products and services into a valid JSON array of objects.
Each object MUST have the following schema:
[
  {
    "name": "Product Name",
    "sku": "SKU code (if present in doc, or create sensible SKU like ${categoryPrefix}-101)",
    "category": "${defaultCategory || business.category || 'Products'}",
    "price": 1299.00,
    "stock": 25,
    "unit": "pcs",
    "description": "Short description or specifications"
  }
]

CRITICAL: Return ONLY raw JSON array. Do NOT wrap in markdown code blocks, do NOT add introductory or concluding text.`;

        const result = await model.generateContent([
          {
            inlineData: {
              data: base64Content,
              mimeType: 'application/pdf'
            }
          },
          prompt
        ]);

        const textOutput = result.response.text().trim();
        const cleanedJson = textOutput.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        const json = JSON.parse(cleanedJson);
        if (Array.isArray(json) && json.length > 0) {
          parsedItems = json;
          console.log(`✨ [Gemini AI] Successfully extracted ${json.length} items from PDF.`);
        }
      } catch (geminiErr: any) {
        console.warn('⚠️ Gemini PDF extraction notice:', geminiErr.message);
      }
    }

    // Strategy 2: Use Groq LLM if Gemini didn't return items
    if (parsedItems.length === 0 && ENV.GROQ_API_KEY && extractedText.trim().length > 0) {
      try {
        const groqModel = ENV.GROQ_LLM_MODEL || 'openai/gpt-oss-120b';
        const prompt = `You are an AI Inventory & Catalog Parser for "${business.businessName}".
The following text was extracted from a PDF catalog, price list, or inventory document:

--- BEGIN EXTRACTED TEXT ---
${extractedText.slice(0, 16000)}
--- END EXTRACTED TEXT ---

Examine the headers (Product Name, SKU, Category, Price, Stock, Unit, Description) and extract every item into a valid JSON array of objects.
Each object MUST have:
[
  {
    "name": "Product Name",
    "sku": "SKU or generate ${categoryPrefix}-101",
    "category": "${defaultCategory || business.category || 'Products'}",
    "price": 1299.00,
    "stock": 10,
    "unit": "pcs",
    "description": "Short description"
  }
]

CRITICAL: Return ONLY raw JSON array. Do not include markdown code block syntax or explanations.`;

        let groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 1500
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
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 1500
            })
          });
        }

        if (groqRes.ok) {
          const data = await groqRes.json();
          const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
          const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
          const json = JSON.parse(cleanedJson);
          if (Array.isArray(json) && json.length > 0) {
            parsedItems = json;
            console.log(`✨ [Groq AI] Successfully extracted ${json.length} items from PDF text.`);
          }
        }
      } catch (groqErr: any) {
        console.warn('⚠️ Groq PDF extraction notice:', groqErr.message);
      }
    }

    // Strategy 3: Heuristic text line extraction if LLM is unavailable
    if (parsedItems.length === 0) {
      const lines = extractedText.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
      let count = 1;
      for (const line of lines) {
        const priceMatch = line.match(/(?:₹|Rs\.?|\$)\s*(\d+(?:\.\d{1,2})?)|\b(\d{2,6}(?:\.\d{1,2})?)\b/);
        if (priceMatch) {
          const rawPrice = parseFloat(priceMatch[1] || priceMatch[2]);
          const namePart = line.replace(priceMatch[0], '').replace(/[^\w\s-]/g, '').trim();
          if (namePart.length >= 3 && rawPrice > 0) {
            parsedItems.push({
              name: namePart,
              sku: `${categoryPrefix}-${String(count).padStart(3, '0')}`,
              category: defaultCategory || business.category || 'Products',
              price: rawPrice,
              stock: 10,
              unit: 'pcs',
              description: `Imported from ${fileName}`
            });
            count++;
          }
        }
      }
    }
  }

    if (parsedItems.length === 0) {
      throw new Error(`Could not parse any product rows from "${fileName}". Please ensure the PDF or spreadsheet contains product names and prices.`);
    }

    // Sanitize and upsert each item into PostgreSQL
    const savedItems = [];
    let itemIndex = 1;
    for (const raw of parsedItems) {
      const name = String(raw.name || '').trim();
      if (!name) continue;

      const price = Math.max(0, parseFloat(String(raw.price)) || 0);
      const stock = Math.max(0, parseInt(String(raw.stock), 10) || 10);
      const category = String(raw.category || defaultCategory || business.category || 'General').trim();
      const unit = String(raw.unit || 'pcs').trim() || 'pcs';
      const description = raw.description ? String(raw.description).trim() : `Imported from ${fileName}`;
      const sku = raw.sku && String(raw.sku).trim()
        ? String(raw.sku).trim()
        : `${categoryPrefix}-${String(itemIndex + Math.floor(Math.random() * 800)).padStart(3, '0')}`;

      const saved = await CatalogService.upsertItem({
        businessId: business.id,
        sku,
        name,
        category,
        price,
        stock,
        unit,
        description,
        isAvailable: stock > 0
      });

      savedItems.push(saved);
      itemIndex++;
    }

    // Automatically sync embeddings to pgvector
    // Fetch all current items for this business so the table underneath shows all-in-one!
    const allCatalogItems = await prisma.catalogItem.findMany({
      where: { businessId: business.id },
      orderBy: { name: 'asc' }
    });

    console.log(`✅ [Catalog] Successfully imported ${savedItems.length} products from "${fileName}" for business "${business.businessName}". Total in catalog: ${allCatalogItems.length}`);

    return {
      success: true,
      count: savedItems.length,
      totalCount: allCatalogItems.length,
      items: allCatalogItems,
      newItems: savedItems,
      message: `Successfully imported ${savedItems.length} products from "${fileName}"! All ${allCatalogItems.length} products are now in your active catalog table.`
    };
  }

  /**
   * Computes the 5 Inventory KPI Cards (Total SKUs, In Stock, Low Stock, Out of Stock, Valuation)
   * tailored to any sector-specific solution (Medicine, Gym, Grocery, Electronics, Restaurant, Salon, Custom)
   */
  public static async getCatalogMetrics(businessId: string, categoryFilter?: string) {
    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    });

    const where: any = { businessId };
    if (categoryFilter && categoryFilter !== 'all') {
      where.category = categoryFilter;
    }

    const items = await prisma.catalogItem.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    const currency = business?.currency || '₹';
    const sector = (business?.category || 'custom').toLowerCase();

    const totalSkus = items.length;
    const inStock = items.filter((i) => (i.stock || 0) > 5 && i.isAvailable !== false).length;
    const lowStock = items.filter((i) => (i.stock || 0) > 0 && (i.stock || 0) <= 5 && i.isAvailable !== false).length;
    const outOfStock = items.filter((i) => (i.stock || 0) === 0 || i.isAvailable === false).length;
    const valuation = items.reduce((acc, i) => {
      const priceNum = typeof (i.price as any)?.toNumber === 'function' ? (i.price as any).toNumber() : Number(i.price) || 0;
      return acc + priceNum * (Number(i.stock) || 0);
    }, 0);

    // Deterministic Indian currency comma separation
    const roundedVal = Math.round(valuation);
    const strVal = roundedVal.toString();
    let formattedNumber = strVal;
    if (strVal.length > 3) {
      const lastThree = strVal.substring(strVal.length - 3);
      const otherNumbers = strVal.substring(0, strVal.length - 3);
      const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      formattedNumber = `${formattedOther},${lastThree}`;
    }
    const formattedValuation = `${currency}${formattedNumber}`;

    const sectorSubtexts: Record<string, { total: string; inStock: string; lowStock: string; outOfStock: string; valuation: string }> = {
      medicine: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      gym: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      grocery: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      electronics: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      restaurant: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      salon: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      },
      custom: {
        total: "All items in catalog",
        inStock: "> 5 units ready",
        lowStock: "1 - 5 units left",
        outOfStock: "0 units or inactive",
        valuation: "Total inventory"
      }
    };

    const activeSectorDesc = sectorSubtexts[sector] || sectorSubtexts.custom;

    const cards = [
      {
        id: "total_skus",
        title: "TOTAL SKUS",
        value: totalSkus,
        count: totalSkus,
        subtext: activeSectorDesc.total,
        icon: "Package",
        colorTheme: "slate"
      },
      {
        id: "in_stock",
        title: "IN STOCK",
        value: inStock,
        count: inStock,
        subtext: activeSectorDesc.inStock,
        icon: "CheckCircle2",
        colorTheme: "emerald"
      },
      {
        id: "low_stock",
        title: "LOW STOCK",
        value: lowStock,
        count: lowStock,
        subtext: activeSectorDesc.lowStock,
        icon: "AlertCircle",
        colorTheme: "amber"
      },
      {
        id: "out_of_stock",
        title: "OUT OF STOCK",
        value: outOfStock,
        count: outOfStock,
        subtext: activeSectorDesc.outOfStock,
        icon: "Boxes",
        colorTheme: "rose"
      },
      {
        id: "valuation",
        title: "VALUATION",
        value: formattedValuation,
        count: valuation,
        subtext: activeSectorDesc.valuation,
        icon: "Sparkles",
        colorTheme: "teal"
      }
    ];

    return {
      success: true,
      category: sector,
      businessId,
      currency,
      summary: {
        totalSkus,
        inStock,
        lowStock,
        outOfStock,
        valuation,
        formattedValuation
      },
      cards
    };
  }

  /**
   * Returns comprehensive product categories for all business sectors,
   * merged with all live distinct categories present in this business's database.
   */
  public static async getCatalogCategories(businessId: string): Promise<{
    success: boolean;
    sector: string;
    categories: string[];
    categoryCounts: Record<string, number>;
  }> {
    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId },
      select: { category: true }
    });

    const sector = (business?.category || 'custom').toLowerCase();

    const sectorTaxonomies: Record<string, string[]> = {
      restaurant: [
        "Appetizers",
        "Starters",
        "Main Course",
        "Vegetarian",
        "Non-Vegetarian",
        "Breads",
        "Rice & Biryani",
        "Beverages",
        "Dessert",
        "Soups & Salads",
        "Combos & Platters",
        "Chef's Specials"
      ],
      medicine: [
        "Fever & Pain",
        "Antibiotics",
        "Supplements",
        "Medical Devices",
        "First Aid",
        "Digestion & Acidity",
        "Respiratory & Cough",
        "Pediatric Care",
        "Skincare & Dermatology",
        "Eye & Ear Care",
        "Diabetes Care",
        "Ayurvedic & Herbal"
      ],
      gym: [
        "Memberships",
        "Personal Training",
        "Protein & Whey",
        "Creatine & Aminos",
        "Pre-Workout & Energy",
        "Healthy Snacks & Drinks",
        "Gym Gear & Lifting Straps",
        "Workout Apparel",
        "Day Pass & Classes",
        "Diet Consultation"
      ],
      grocery: [
        "Grains & Rice",
        "Flour & Atta",
        "Dairy & Eggs",
        "Cooking Essentials & Oils",
        "Pulses & Dals",
        "Fresh Fruits",
        "Fresh Vegetables",
        "Spices & Masalas",
        "Snacks & Namkeen",
        "Beverages & Tea/Coffee",
        "Dry Fruits & Nuts",
        "Household & Cleaning"
      ],
      electronics: [
        "Peripherals & Keyboards",
        "Audio & Earbuds",
        "Displays & Monitors",
        "Accessories & Chargers",
        "Wearables & Smartwatches",
        "Cables & Adapters",
        "Smartphones & Tablets",
        "Laptops & Computers",
        "Smart Home & Lighting",
        "Storage & Hard Drives",
        "Cameras & Webcams",
        "Gaming Accessories"
      ],
      salon: [
        "Hair & Grooming",
        "Hair Care & Treatments",
        "Skin & Facials",
        "Spa & Body Massage",
        "Nails & Feet",
        "Bridal & Occasions",
        "Beard Care & Shaving",
        "Waxing & Threading",
        "Retail Products",
        "Hair Color & Highlights",
        "Detox & Scalp Care",
        "Packages & Combos"
      ],
      custom: [
        "Apparel & Fashion",
        "Lifestyle & Accessories",
        "Travel & Bags",
        "Home & Kitchen",
        "Electronics & Gadgets",
        "Home Decor",
        "Stationery & Office",
        "Services & Consultation",
        "Subscriptions & Passes",
        "Packages & Bundles",
        "Hardware & Tools",
        "General Products"
      ]
    };

    const presetCategories = sectorTaxonomies[sector] || sectorTaxonomies.custom;

    // Retrieve all live items in DB for this business
    const items = await prisma.catalogItem.findMany({
      where: { businessId },
      select: { category: true }
    });

    const categoryCounts: Record<string, number> = {};
    const existingCategories: string[] = [];

    for (const item of items) {
      const cat = item.category?.trim();
      if (cat) {
        if (!existingCategories.includes(cat)) {
          existingCategories.push(cat);
        }
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    // Merge: Put categories with items first, then additional presets
    const allCategories = Array.from(new Set([...existingCategories, ...presetCategories])).filter(Boolean);

    return {
      success: true,
      sector,
      categories: allCategories,
      categoryCounts
    };
  }
}
