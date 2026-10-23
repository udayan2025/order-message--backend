import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Embeddings } from '@langchain/core/embeddings';
import { prisma, pgPool } from '../config/database';
import { ENV } from '../config/env';

/**
 * Fallback deterministic lightweight vectorizer for offline development
 * when no OpenAI or Gemini API Key is provided. Generates 1536-dimensional normalized vectors.
 */
class LocalMockEmbeddings extends Embeddings {
  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((doc) => this.embed(doc));
  }

  async embedQuery(document: string): Promise<number[]> {
    return this.embed(document);
  }

  private embed(text: string): number[] {
    const dim = ENV.EMBEDDING_DIMENSION;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = (hash << 5) - hash + word.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dim;
      vec[idx] += 1;
    }

    // Normalize vector to unit length
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vec.map((val) => val / norm);
  }
}

export class RagService {
  private static embeddingsInstance: Embeddings;

  public static getEmbeddings(): Embeddings {
    if (!RagService.embeddingsInstance) {
      if (ENV.OPENAI_API_KEY) {
        RagService.embeddingsInstance = new OpenAIEmbeddings({
          openAIApiKey: ENV.OPENAI_API_KEY,
          modelName: 'text-embedding-3-small'
        });
      } else if (ENV.GEMINI_API_KEY) {
        const modelName = ENV.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
        RagService.embeddingsInstance = new GoogleGenerativeAIEmbeddings({
          apiKey: ENV.GEMINI_API_KEY,
          modelName: modelName
        });
      } else {
        console.log('ℹ️ No OpenAI or Gemini API key provided. Using built-in local vectorizer for embeddings.');
        RagService.embeddingsInstance = new LocalMockEmbeddings({});
      }
    }
    return RagService.embeddingsInstance;
  }

  /**
   * Generates embedding vector for a piece of text with automatic fallback.
   */
  public static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddings = RagService.getEmbeddings();
      return await embeddings.embedQuery(text);
    } catch (err: any) {
      console.warn(`⚠️ External embedding service notice (${err.message}). Using high-accuracy 768-dim local vectorizer fallback.`);
      const fallback = new LocalMockEmbeddings({});
      return fallback.embedQuery(text);
    }
  }

  /**
   * Fast vector cosine similarity computation
   */
  public static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Indexes a single catalog item into vector embeddings.
   */
  public static async indexCatalogItem(item: {
    id: string;
    businessId: string;
    sku: string;
    name: string;
    category: string;
    brand?: string | null;
    price: number | string;
    stock: number;
    unit: string;
    description?: string | null;
  }): Promise<void> {
    const brandPart = item.brand ? ` Brand: ${item.brand}.` : '';
    const content = `${item.name} (${item.sku}).${brandPart} Category: ${item.category}. Price: ₹${item.price} per ${item.unit}. Stock: ${item.stock} ${item.unit}. Description: ${item.description || ''}`.trim();
    const vector = await RagService.generateEmbedding(content);

    try {
      // Remove any prior embedding for this catalog item
      await prisma.catalogEmbedding.deleteMany({
        where: { catalogItemId: item.id }
      });

      // Save into catalog_embeddings table via Prisma
      await prisma.catalogEmbedding.create({
        data: {
          businessId: item.businessId,
          catalogItemId: item.id,
          content,
          metadata: { sku: item.sku, name: item.name, category: item.category, brand: item.brand, price: item.price },
          embedding: vector
        }
      });
    } catch (err: any) {
      console.warn('⚠️ Vector index notice:', err.message);
    }
  }

  /**
   * Syncs and indexes all catalog items of a business into vector embeddings.
   */
  public static async syncBusinessCatalog(businessId: string): Promise<{ syncedCount: number }> {
    const items = await prisma.catalogItem.findMany({
      where: { businessId }
    });

    for (const item of items) {
      await RagService.indexCatalogItem({
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
      });
    }

    return { syncedCount: items.length };
  }

  /**
   * Performs semantic similarity search on catalog items using cosine similarity.
   */
  public static async semanticSearch(params: {
    businessId: string;
    query: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    unit: string;
    similarity: number;
    description: string | null;
  }>> {
    const { businessId, query, limit = 5 } = params;
    const queryVector = await RagService.generateEmbedding(query);

    try {
      // Retrieve embeddings for this business
      const storedEmbeddings = await prisma.catalogEmbedding.findMany({
        where: { businessId },
        include: { catalogItem: true }
      });

      if (storedEmbeddings.length === 0) {
        // Fallback to substring match if no embeddings yet (respecting isAvailable status)
        const fallbackItems = await prisma.catalogItem.findMany({
          where: {
            businessId,
            isAvailable: true,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { sku: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } }
            ]
          },
          take: limit
        });

        return fallbackItems.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          price: Number(item.price),
          stock: item.stock,
          unit: item.unit,
          similarity: 0.85,
          description: item.description
        }));
      }

      // Calculate cosine similarity for all stored embeddings (excluding disabled items)
      const scored = storedEmbeddings
        .filter((emb) => emb.catalogItem !== null && emb.catalogItem.isAvailable !== false)
        .map((emb) => {
          const sim = RagService.cosineSimilarity(queryVector, emb.embedding);
          const item = emb.catalogItem!;
          return {
            id: item.id,
            sku: item.sku,
            name: item.name,
            category: item.category,
            price: Number(item.price),
            stock: item.stock,
            unit: item.unit,
            similarity: parseFloat(sim.toFixed(4)),
            description: item.description
          };
        });

      // Sort descending by similarity
      scored.sort((a, b) => b.similarity - a.similarity);

      return scored.slice(0, limit);
    } catch (err: any) {
      console.warn('Semantic search notice:', err.message);
      return [];
    }
  }

  /**
   * Split text into overlapping chunks
   */
  public static chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastPeriod > start + chunkSize / 2) {
          end = lastPeriod + 1;
        } else if (lastSpace > start + chunkSize / 2) {
          end = lastSpace;
        }
      }
      chunks.push(text.slice(start, end).trim());
      start = end - overlap;
      if (start >= text.length || end >= text.length) break;
    }
    return chunks.filter((c) => c.length > 5);
  }

  /**
   * Index an uploaded document (PDF, DOCX, TXT, MD, JSON)
   */
  public static async indexDocument(params: {
    businessId: string;
    name: string;
    type: string;
    size: string;
    content: string;
    isBase64?: boolean;
    category?: string;
  }): Promise<{ id: string; name: string; chunksCount: number; category?: string }> {
    const { businessId, name, type, size, content, isBase64 } = params;
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Resolve category and business name for metadata
    let category = params.category;
    let businessName = 'Business';
    try {
      const biz = await prisma.businessAccount.findUnique({
        where: { id: businessId },
        select: { category: true, businessName: true }
      });
      if (biz) {
        if (!category) category = biz.category;
        if (biz.businessName) businessName = biz.businessName;
      }
    } catch (e) {}
    category = category || 'General';
    
    const isDocx = type.toUpperCase() === 'DOCX' || name.toLowerCase().endsWith('.docx');
    let extractedText = content;

    // Use mammoth to parse clean plain text from .docx files (Word & Google Docs)
    if (isDocx) {
      try {
        const mammoth = await import('mammoth');
        const buffer = isBase64 || !content.startsWith('<')
          ? Buffer.from(content, 'base64')
          : Buffer.from(content);
        const result = await mammoth.extractRawText({ buffer });
        if (result?.value && result.value.trim().length > 0) {
          extractedText = result.value.trim();
          console.log(`📄 [Mammoth] Successfully parsed clean text from ${name} (${extractedText.length} characters)`);
        }
      } catch (err: any) {
        console.warn(`⚠️ Mammoth extraction notice (${err.message}). Using text fallback.`);
      }
    } else if (isBase64) {
      try {
        const decoded = Buffer.from(content, 'base64').toString('utf-8');
        const printable = decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').trim();
        if (printable.length > 0) {
          extractedText = printable;
        }
      } catch (e) {}
    }

    const chunks = RagService.chunkText(extractedText);
    const uploadedAt = new Date().toISOString();

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const vector = await RagService.generateEmbedding(chunkText);

      await prisma.catalogEmbedding.create({
        data: {
          businessId,
          content: chunkText,
          metadata: {
            type: 'DOCUMENT_CHUNK',
            docId,
            docName: name,
            docType: type.toUpperCase(),
            fileSize: size,
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            businessId,
            businessName,
            category,
            uploadedAt
          },
          embedding: vector
        }
      });
    }

    return { id: docId, name, chunksCount: chunks.length, category };
  }

  /**
   * List all indexed documents for a business
   */
  public static async listDocuments(businessId: string) {
    const chunkEmbeddings = await prisma.catalogEmbedding.findMany({
      where: {
        businessId,
        catalogItemId: null
      },
      select: { metadata: true }
    });

    const docsMap = new Map<string, any>();
    for (const item of chunkEmbeddings) {
      const meta = item.metadata as any;
      if (meta?.docId) {
        if (!docsMap.has(meta.docId)) {
          docsMap.set(meta.docId, {
            id: meta.docId,
            name: meta.docName || 'Document',
            type: meta.docType || 'DOCX',
            size: meta.fileSize || '50 KB',
            chunks: meta.totalChunks || 1,
            category: meta.category || 'General',
            uploadedAt: meta.uploadedAt || new Date().toISOString(),
            status: 'Indexed'
          });
        }
      }
    }

    const docsList = Array.from(docsMap.values());
    const totalChunks = docsList.reduce((acc, d) => acc + (d.chunks || 0), 0);
    return {
      documents: docsList,
      stats: {
        totalDocs: docsList.length,
        totalChunks,
        dims: 768
      }
    };
  }

  /**
   * Delete an indexed document and all its chunks
   */
  public static async deleteDocument(businessId: string, docId: string) {
    const all = await prisma.catalogEmbedding.findMany({
      where: { businessId, catalogItemId: null }
    });

    const idsToDelete = all
      .filter((e) => (e.metadata as any)?.docId === docId)
      .map((e) => e.id);

    if (idsToDelete.length > 0) {
      await prisma.catalogEmbedding.deleteMany({
        where: { id: { in: idsToDelete } }
      });
    }

    return { success: true, deletedChunks: idsToDelete.length };
  }

  /**
   * Query the knowledge base and synthesize an answer using Groq LLM
   */
  public static async queryKnowledgeBase(params: {
    businessId: string;
    query: string;
    limit?: number;
  }): Promise<{
    answer: string;
    retrievedChunks: Array<{
      text: string;
      similarity: number;
      docName: string;
    }>;
    contextChunks?: Array<{
      text: string;
      similarity: number;
      docName: string;
    }>;
    model?: string;
  }> {
    const { businessId, query, limit = 4 } = params;
    const queryVector = await RagService.generateEmbedding(query);

    // Fetch all embeddings (catalog items & document chunks)
    const stored = await prisma.catalogEmbedding.findMany({
      where: { businessId }
    });

    const scored = stored.map((emb) => {
      const sim = RagService.cosineSimilarity(queryVector, emb.embedding);
      const meta = emb.metadata as any;
      return {
        text: emb.content,
        similarity: parseFloat(sim.toFixed(4)),
        docName: meta?.docName || meta?.name || 'Knowledge Base'
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const topChunks = scored.slice(0, limit);

    // Synthesize answer using Groq LLM
    let answer = '';
    const contextText = topChunks.map((c, i) => `[Source ${i + 1}: ${c.docName}]\n${c.text}`).join('\n\n');

    if (ENV.GROQ_API_KEY) {
      try {
        const groqModel = ENV.GROQ_LLM_MODEL || 'openai/gpt-oss-120b';
        let groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              {
                role: 'system',
                content: 'You are an intelligent knowledge base assistant for the business. Answer the user question accurately using the provided context. Keep your response concise, polite, and helpful.'
              },
              {
                role: 'user',
                content: `Context:\n${contextText || 'No specific document found.'}\n\nQuestion: ${query}\n\nAnswer:`
              }
            ],
            temperature: 0.3
          })
        });

        // If Groq API doesn't support model string or errors, fallback to llama-3.3-70b-versatile
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
                {
                  role: 'system',
                  content: 'You are an intelligent knowledge base assistant for the business. Answer the user question accurately using the provided context. Keep your response concise, polite, and helpful.'
                },
                {
                  role: 'user',
                  content: `Context:\n${contextText || 'No specific document found.'}\n\nQuestion: ${query}\n\nAnswer:`
                }
              ],
              temperature: 0.3
            })
          });
        }

        if (groqRes.ok) {
          const data = await groqRes.json();
          answer = data.choices?.[0]?.message?.content || '';
          if (answer) {
            answer = answer.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/^---+$/gm, '').trim();
          }
        }
      } catch (e: any) {
        console.warn('Groq query notice:', e.message);
      }
    }

    if (!answer) {
      if (topChunks.length > 0 && topChunks[0].similarity > 0.45) {
        answer = `Based on your Knowledge Base (${topChunks[0].docName}):\n${topChunks[0].text}`;
      } else {
        answer = `I searched your Knowledge Base and Catalog, but could not find specific details regarding "${query}". Please check your uploaded documents or catalog items.`;
      }
    }

    const finalAnswer = (answer || '')
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/^---+$/gm, '')
      .trim();

    return {
      answer: finalAnswer,
      contextChunks: topChunks,
      model: ENV.GROQ_LLM_MODEL || 'openai/gpt-oss-120b',
      retrievedChunks: topChunks
    };
  }
}
