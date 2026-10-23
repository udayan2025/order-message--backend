import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ENV } from '../config/env';

export interface CategoryVisualProfile {
  label: string;
  keywords: string[];
  suggestions: string[];
  promptEnhancer: (subject: string, businessName: string) => string;
}

export const CATEGORY_VISUAL_PROFILES: Record<string, CategoryVisualProfile> = {
  gym: {
    label: "Fitness & Gym",
    keywords: [
      "gym", "fitness", "workout", "dumbbell", "barbell", "weights", "equipment", 
      "treadmill", "bench press", "squat", "crossfit", "muscle", "bodybuilder", 
      "bodybuilding", "trainer", "training", "supplement", "whey", "protein", 
      "creatine", "exercise", "cardio", "gym interior", "gym poster", "studio", 
      "bicep", "pullup", "gym floor", "locker room", "transformation", "kettlebell", 
      "leg press", "smith machine", "diet", "nutrition", "rower", "athlete"
    ],
    suggestions: [
      "Heavy dumbbell rack & Olympic barbell workout zone",
      "Modern crossfit studio floor with cardio machines",
      "Whey protein tub & fitness supplement display",
      "High-energy personal trainer workout poster"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Cinematic commercial photography of ${subject}, modern premium fitness gym background, dramatic studio rim lighting, 4k ultra detailed, hyperrealistic, athletic aesthetic, sharp focus, 1024x1024, advertising poster quality`
  },
  medicine: {
    label: "Pharmacy & Healthcare",
    keywords: [
      "medicine", "pharma", "pharmacy", "drug", "pill", "capsule", "tablet", "syrup", 
      "prescription", "doctor", "healthcare", "clinic", "first aid", "bandage", 
      "thermometer", "stethoscope", "vitamin", "ointment", "medical", "hospital", 
      "shelf", "counter", "dispensing", "mask", "syringes", "wellness", "supplement", 
      "inhaler", "glucometer", "bp monitor", "sanitizer", "lab"
    ],
    suggestions: [
      "Organized pharmacy medicine shelves & counter setup",
      "First aid kit & essential healthcare supplies display",
      "Daily multivitamin & health supplement bottles",
      "Clinical pharmacy storefront with licensed dispensing desk"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Professional clean studio photo of ${subject}, licensed pharmacy and healthcare clinic background, soft clinical lighting, 4k ultra detailed, hyperrealistic, sharp focus, 1024x1024, medical commercial standard`
  },
  grocery: {
    label: "Supermarket & Express Grocery",
    keywords: [
      "grocery", "supermarket", "fruit", "vegetable", "produce", "apple", "banana", 
      "milk", "dairy", "bread", "bakery", "cereal", "flour", "rice", "dal", "grain", 
      "snack", "basket", "cart", "store aisle", "fresh", "organic", "spices", "butter", 
      "cheese", "eggs", "oil", "pantry", "vegetables", "fruits", "mart", "farm"
    ],
    suggestions: [
      "Fresh organic fruits & vegetables in a wooden market crate",
      "Neatly organized modern supermarket grocery aisles",
      "Warm artisanal bakery bread & fresh dairy morning basket",
      "Assorted grains, spices & daily pantry staples showcase"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Vibrant commercial food photography of fresh ${subject}, supermarket grocery setting, bright natural morning lighting, 4k ultra detailed, hyperrealistic, fresh and appetizing, 1024x1024`
  },
  electronics: {
    label: "Consumer Electronics & Tech",
    keywords: [
      "electronics", "gadget", "phone", "smartphone", "laptop", "computer", "monitor", 
      "display", "headphone", "audio", "speaker", "charger", "cable", "gaming", 
      "console", "smartwatch", "tech", "device", "camera", "tablet", "keyboard", 
      "mouse", "gpu", "processor", "airpods", "earbuds", "tv"
    ],
    suggestions: [
      "Flagship smartphone with futuristic titanium camera array",
      "Pro gaming battle station desk with RGB mechanical keyboard",
      "Premium wireless noise-canceling headphones & audio station",
      "Ultra-slim workstation laptop with 4K bezel-less display"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `High-end product photography of ${subject}, sleek tech showroom setting, neon cyber accent lighting, 4k ultra detailed, hyperrealistic, modern tech aesthetic, 1024x1024`
  },
  restaurant: {
    label: "Restaurant & Culinary Kitchen",
    keywords: [
      "restaurant", "food", "dish", "meal", "biryani", "starter", "curry", "pizza", 
      "burger", "chef", "kitchen", "dining", "menu", "beverage", "shake", "coffee", 
      "dessert", "plate", "table", "culinary", "appetizer", "pasta", "sandwich", 
      "drink", "cocktail", "mocktail", "paneer", "chicken", "salad", "roast", "bake"
    ],
    suggestions: [
      "Signature royal chef special biryani platter with rich spices",
      "Sizzling gourmet appetizer platter with artisan dips",
      "Craft barista espresso & decadent chocolate dessert plate",
      "Ambient fine-dining restaurant candlelit dinner table"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Mouth-watering gourmet food photography of ${subject}, restaurant dining presentation, warm atmospheric lighting, subtle rising steam, shallow depth of field, 4k ultra detailed, hyperrealistic, 1024x1024`
  },
  salon: {
    label: "Salon, Spa & Beauty Lounge",
    keywords: [
      "salon", "spa", "hair", "haircut", "styling", "facial", "massage", "beauty", 
      "skincare", "manicure", "pedicure", "grooming", "makeup", "lounge", "chair", 
      "mirror", "serum", "keratin", "glow", "barber", "shampoo", "cream", "lotion", 
      "eyebrows", "cosmetics", "facials"
    ],
    suggestions: [
      "Luxury modern salon hair styling station with vanity mirrors",
      "Tranquil wellness spa aromatherapy massage suite with lotus petals",
      "Professional hair makeover styling & grooming setup",
      "Organic botanical facial & skincare beauty treatment kit"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Luxury beauty commercial photography of ${subject}, modern elegant salon and spa background, warm glamorous lighting, 4k ultra detailed, hyperrealistic, sharp focus, 1024x1024`
  },
  custom: {
    label: "Enterprise Business & Commerce",
    keywords: [
      "business", "office", "workspace", "product", "service", "consultation", 
      "desk", "team", "meeting", "company", "store", "catalog", "corporate", 
      "commercial", "suite", "headquarters", "brand"
    ],
    suggestions: [
      "Executive corporate business consultation suite",
      "Premium branded product & showcase presentation",
      "Modern creative enterprise conference & innovation hub",
      "Professional client service welcome desk"
    ],
    promptEnhancer: (subject: string, biz: string) =>
      `Corporate commercial photography of ${subject}, modern architectural business headquarters background, clean executive lighting, 4k ultra detailed, hyperrealistic, 1024x1024`
  }
};

export interface ImageOrDocQueryResult {
  handled: boolean;
  aiGeneratedReply: string;
  mediaUrl?: string;
  imageBuffer?: Buffer;
  pdfBuffer?: Buffer;
  fileName?: string;
  messageType?: 'text' | 'image' | 'document';
}

export class ImageService {
  /**
   * Detects if the incoming message has an intent to generate an image or visual media
   */
  public static isImageIntent(query: string): boolean {
    const q = query.toLowerCase().trim();
    // Keywords indicating visual creation
    const imageKeywords = /\b(image|photo|picture|pic|poster|banner|wallpaper|graphic|visual|drawing|illustration|sketch)\b/i;
    const commandVerbs = /\b(generate|create|draw|make|render|design|show me|give me|produce|paint)\b/i;

    return (
      (commandVerbs.test(q) && imageKeywords.test(q)) ||
      /\b(generate|create|draw|make|show me an?|picture of|photo of|image of)\s+([a-z0-9\s]+)\s+(image|photo|picture|pic|poster|banner)/i.test(q) ||
      /\b(generate|create|draw|make)\s+(an?\s+)?(image|photo|picture|pic|poster|banner)/i.test(q) ||
      /^(please\s+)?(generate|create|draw|make)\s+(an?\s+)?image/i.test(q) ||
      /\b(image|photo|picture)\s*[:=]/i.test(q)
    );
  }

  /**
   * Detects if the incoming message has an intent to generate or view a PDF / Catalog document
   */
  public static isPdfIntent(query: string): boolean {
    const q = query.toLowerCase().trim();
    return (
      (/\b(pdf|document|catalog pdf|catalogue pdf|price list pdf|rate card pdf|brochure)\b/i.test(q) &&
        /\b(generate|create|send|download|give|share|export|make|view|get|provide|need)\b/i.test(q)) ||
      /\b(diet\s+plan|personal\s+training|workout|membership|catalog)\s+pdf\b/i.test(q) ||
      /\bpdf\s+(of|for)\s+([a-z0-9\s]+)/i.test(q)
    );
  }

  /**
   * Extracts the PDF subject from a user query (e.g. "Create a pdf of diet plan" -> "diet plan")
   */
  public static extractPdfSubject(query: string): string {
    let clean = query.trim();
    clean = clean.replace(/^(hey|hi|hello|heya|hlo|dear|ok|okay)[,\s]+/i, '');
    clean = clean.replace(/^(can you|could you|would you|will you|i want you to|i would like you to|i need you to|help me|tell me to)[,\s]+/i, '');
    clean = clean.replace(/^(please|kindly)[,\s]+/i, '');
    clean = clean.replace(/^(generate|create|send|download|give|share|export|make|view|get)\s+(me\s+)?(an?\s+)?/i, '');
    clean = clean.replace(/^(pdf|document|brochure|file|catalog|rate card)\s*(of|for|about|:)?\s*/i, '');
    clean = clean.replace(/\s+(pdf|document|file|brochure)$/i, '');
    clean = clean.replace(/^(an?\s+)/i, '');
    clean = clean.replace(/[:=?!.,]+$/g, '').trim();
    return clean;
  }

  /**
   * Extracts the subject from the query, stripping command verbs, conversational greetings & filler words
   */
  public static extractSubject(query: string): string {
    let clean = query.trim();

    // Strip conversational greetings and prefixes
    clean = clean.replace(/^(hey|hi|hello|heya|hlo|dear|ok|okay)[,\s]+/i, '');
    clean = clean.replace(/^(can you|could you|would you|will you|i want you to|i would like you to|i need you to|help me|tell me to)[,\s]+/i, '');
    clean = clean.replace(/^(please|kindly)[,\s]+/i, '');
    clean = clean.replace(/^(generate|create|draw|make|render|design|show me|give me|produce|paint|get me)\s+(me\s+)?(an?\s+)?/i, '');
    clean = clean.replace(/^(image|photo|picture|pic|poster|banner|visual|graphic|wallpaper|drawing)\s*(of|for|about|:)?\s*/i, '');
    clean = clean.replace(/\s+(image|photo|picture|pic|poster|banner|wallpaper|graphic|drawing)$/i, '');
    clean = clean.replace(/^(an?\s+)/i, '');
    clean = clean.replace(/[:=?!.,]+$/g, '').trim();

    return clean;
  }

  /**
   * Strictly checks if the requested subject fits the business category or existing catalog items
   */
  public static isCategoryMatch(
    subject: string,
    categoryKey: string,
    catalogItems: Array<{ name: string; category?: string }> = []
  ): boolean {
    const profile = CATEGORY_VISUAL_PROFILES[categoryKey] || CATEGORY_VISUAL_PROFILES.custom;
    const lowerSub = subject.toLowerCase().trim();

    if (!lowerSub || lowerSub.length < 2) return false;

    // Stop words that must never trigger a category match
    const stopWords = new Set([
      'hey', 'hello', 'please', 'can', 'you', 'want', 'need', 'give', 'show', 'make',
      'generate', 'create', 'image', 'photo', 'picture', 'pic', 'for', 'the', 'and',
      'with', 'like', 'good', 'best', 'some', 'any', 'pro', 'max', 'new', 'one', 'two',
      'all', 'about', 'draw', 'have', 'see', 'this', 'that', 'our'
    ]);

    // 1. Exact phrase / keyword match (e.g. subject contains "dumbbell", "whey", "treadmill", "workout")
    for (const kw of profile.keywords) {
      const lowerKw = kw.toLowerCase();
      if (lowerSub === lowerKw || lowerSub.includes(lowerKw)) {
        return true;
      }
    }

    // 2. Word-by-word match: meaningful words in subject (length >= 4 and not in stopWords)
    const subjectWords = lowerSub.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stopWords.has(w));
    for (const word of subjectWords) {
      for (const kw of profile.keywords) {
        const lowerKw = kw.toLowerCase();
        if (lowerKw === word || lowerKw.split(/\s+/).includes(word)) {
          return true;
        }
      }
    }

    // 3. Match against live catalog items
    for (const item of catalogItems) {
      const n = item.name.toLowerCase();
      const c = (item.category || '').toLowerCase();
      if (lowerSub.includes(n) || (n.length >= 4 && lowerSub.includes(n))) return true;
      if (c && c.length >= 4 && lowerSub.includes(c)) return true;
      const catWords = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stopWords.has(w));
      for (const cw of catWords) {
        if (subjectWords.includes(cw)) return true;
      }
    }

    return false;
  }

  /**
   * Constructs the direct Pollinations.ai image URL
   */
  public static buildPollinationsUrl(prompt: string): string {
    const encoded = encodeURIComponent(prompt.trim());
    return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true`;
  }

  /**
   * Main Priority: Upload generated image buffer directly to Cloudinary using .env credentials
   * Fallback: Save buffer to local uploads/ folder and serve via Express /uploads/
   */
  public static async uploadToCloudinaryOrLocal(imageBuffer: Buffer, subject: string): Promise<{ mediaUrl: string; localPath: string }> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    // 1. Always save a reliable local copy in uploads/ folder
    const uniqueId = `${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const cleanSub = subject.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'visual';
    const fileName = `gen_image_${cleanSub}_${uniqueId}.jpg`;
    const localFilePath = path.join(ENV.UPLOAD_DIR, fileName);

    if (!fs.existsSync(ENV.UPLOAD_DIR)) {
      fs.mkdirSync(ENV.UPLOAD_DIR, { recursive: true });
    }
    fs.writeFileSync(localFilePath, imageBuffer);
    let finalMediaUrl = `/uploads/${fileName}`;

    // 2. MAIN PRIORITY: Upload buffer directly to Cloudinary into folder "whatsapp_gateway"
    if (cloudName) {
      try {
        console.log(`☁️ [Cloudinary] Uploading ${imageBuffer.length} bytes image buffer to Cloudinary (${cloudName}/whatsapp_gateway)...`);
        const base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        const folder = 'whatsapp_gateway';
        const publicId = `img_${cleanSub}_${uniqueId}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const formData = new URLSearchParams();
        formData.append('file', base64Data);

        if (apiKey && apiSecret) {
          // Authenticated Cloudinary signed upload into folder whatsapp_gateway
          const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
          const signature = crypto.createHash('sha1').update(toSign).digest('hex');

          formData.append('api_key', apiKey);
          formData.append('timestamp', timestamp);
          formData.append('signature', signature);
          formData.append('folder', folder);
          formData.append('public_id', publicId);
        } else {
          if (uploadPreset) formData.append('upload_preset', uploadPreset);
          formData.append('folder', folder);
          formData.append('public_id', publicId);
        }

        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        });

        if (res.ok) {
          const data: any = await res.json();
          if (data && data.secure_url) {
            finalMediaUrl = data.secure_url;
            console.log(`✅ [Cloudinary] Image uploaded successfully to CDN in folder "whatsapp_gateway": ${finalMediaUrl}`);
          }
        } else {
          const errText = await res.text();
          console.warn(`⚠️ [Cloudinary] Upload notice (${res.status}): ${errText.slice(0, 150)}. Using local upload.`);
        }
      } catch (err: any) {
        console.warn('⚠️ [Cloudinary] Upload exception (using local upload fallback):', err.message);
      }
    } else {
      console.log('ℹ️ [ImageService] No CLOUDINARY_CLOUD_NAME configured. Stored in local uploads folder.');
    }

    return { mediaUrl: finalMediaUrl, localPath: localFilePath };
  }

  /**
   * Orchestrates the complete category-constrained image / PDF request flow
   */
  public static async handleImageOrDocQuery(params: {
    businessId: string;
    businessName: string;
    category: string;
    query: string;
    catalogItems?: Array<{ name: string; category?: string; price?: number }>;
    currency?: string;
  }): Promise<ImageOrDocQueryResult> {
    const { businessName, category, query, catalogItems = [], currency = '₹' } = params;
    const catKey = (category || 'custom').toLowerCase();
    const profile = CATEGORY_VISUAL_PROFILES[catKey] || CATEGORY_VISUAL_PROFILES.custom;

    // 1. PDF / Document Generation Intent
    if (this.isPdfIntent(query)) {
      const rawPdfSub = this.extractPdfSubject(query);
      const cleanPdfSub = rawPdfSub.replace(/^(a|an|the)\s+/i, '').trim();
      const lowerPdfSub = cleanPdfSub.toLowerCase();

      // Check if user specifically requested an off-topic PDF (e.g. "create a pdf of iphone repair" when category is gym)
      const isGenericPdf = !lowerPdfSub || ['pdf', 'document', 'file', 'catalog', 'brochure', ''].includes(lowerPdfSub);
      const isMatch = isGenericPdf || this.isCategoryMatch(cleanPdfSub, catKey, catalogItems);

      if (!isMatch && !isGenericPdf) {
        // Off-topic PDF request -> Politely decline and provide category-tailored suggestions
        return {
          handled: true,
          messageType: 'text',
          aiGeneratedReply: `I specialize exclusively in ${profile.label} for ${businessName}! 📄 I'm unable to create documents for '${cleanPdfSub}', as I only provide guides and schedules related to our ${profile.label} services.\n\nHere are some relevant documents I can generate for you right now:\n• *Diet & Nutrition Plan*\n• *1-on-1 Personal Training Schedule*\n• *Workout & Hypertrophy Routine*\n• *Store Services & Membership Catalog*\n\nWould you like me to generate one of these for you instead?`
        };
      }

      // Category matches (or generic catalog): generate real downloadable PDF & upload to Cloudinary!
      const resolvedSubject = cleanPdfSub || `${profile.label} Guide & Schedule`;
      const { PdfService } = await import('./pdf.service');
      const pdfResult = await PdfService.generateAndUploadPdf({
        businessName,
        category,
        subject: resolvedSubject,
        catalogItems,
        currency
      });

      const replyText = `📄 *Here is your official PDF document for ${businessName}!* 📑\n\n• *Document:* ${pdfResult.fileName}\n• *Topic:* ${resolvedSubject}\n• *Status:* Uploaded & ready for download\n\nI hope this helps you achieve your goals! You can view and download the attached PDF directly. How else can I assist you today?`;

      return {
        handled: true,
        messageType: 'document',
        mediaUrl: pdfResult.mediaUrl,
        pdfBuffer: pdfResult.pdfBuffer,
        fileName: pdfResult.fileName,
        aiGeneratedReply: replyText
      };
    }

    // 2. Image Generation Intent
    if (!this.isImageIntent(query)) {
      return { handled: false, aiGeneratedReply: '' };
    }

    const rawSubject = this.extractSubject(query);
    const lowerSub = rawSubject.toLowerCase().trim();

    // Scenario 1: VAGUE / UNSPECIFIED image request
    // e.g. "please generate a image", "create an image", "generate photo", "make picture"
    const isVague =
      !lowerSub ||
      lowerSub.length < 2 ||
      ['image', 'photo', 'picture', 'pic', 'poster', 'banner', 'something', 'a picture', 'an image', 'visual', 'graphic', 'wallpaper', 'drawing'].includes(lowerSub);

    if (isVague) {
      const suggestionsText = profile.suggestions.map((s) => `• ${s}`).join('\n');
      return {
        handled: true,
        messageType: 'text',
        aiGeneratedReply: `I'd love to generate an image for you! 🎨 Could you please clarify which specific ${profile.label} image you would like to create?\n\nHere are some popular options you can choose from:\n${suggestionsText}\n\nSimply reply with your idea or tell me which one you'd like to see!`
      };
    }

    // Check if the requested subject fits the business category
    const isMatched = this.isCategoryMatch(rawSubject, catKey, catalogItems);

    // Scenario 2: OFF-TOPIC / NON-CATEGORY request
    // e.g. User asks for "iphone", "tree", "car", "superman" for a gym or medicine business
    if (!isMatched) {
      const suggestionsText = profile.suggestions.map((s) => `• ${s}`).join('\n');
      const cleanSubName = rawSubject
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      return {
        handled: true,
        messageType: 'text',
        aiGeneratedReply: `I specialize exclusively in ${profile.label} visuals for ${businessName}! 🎨 I'm unable to create images of '${cleanSubName}', as I only provide images related to our ${profile.label} services.\n\nHere are some relevant images I can generate for you right now:\n${suggestionsText}\n\nWould you like me to generate one of these for you instead?`
      };
    }

    // Scenario 3: CATEGORY-MATCHED image request!
    // e.g. "create a gym equipment image", "generate a photo of dumbbell rack"
    const capitalizedSubject = rawSubject
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    const enhancedPrompt = profile.promptEnhancer(rawSubject, businessName);
    const pollinationsUrl = this.buildPollinationsUrl(enhancedPrompt);

    console.log(`🎨 [ImageService] Generating visual from Pollinations: ${pollinationsUrl}`);
    let imageBuffer: Buffer | undefined = undefined;

    try {
      const imgRes = await fetch(pollinationsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (imgRes.ok) {
        const arrBuf = await imgRes.arrayBuffer();
        imageBuffer = Buffer.from(arrBuf);
        console.log(`✅ [ImageService] Successfully fetched ${imageBuffer.length} bytes image buffer.`);
      } else {
        console.warn(`⚠️ [ImageService] Pollinations response status: ${imgRes.status}`);
      }
    } catch (fetchErr: any) {
      console.warn('⚠️ [ImageService] Failed to download image buffer:', fetchErr.message);
    }

    let finalImageUrl = pollinationsUrl;
    if (imageBuffer && imageBuffer.length > 0) {
      const uploadRes = await this.uploadToCloudinaryOrLocal(imageBuffer, rawSubject);
      finalImageUrl = uploadRes.mediaUrl;
    }

    const sweetMessage = `Here is your image of *${capitalizedSubject}*! 🎨\n\n*Created exclusively for ${businessName}.*\n\nI hope you like it! Can I ask how else I can help you today? 😊`;

    return {
      handled: true,
      mediaUrl: finalImageUrl,
      imageBuffer,
      messageType: 'image',
      aiGeneratedReply: sweetMessage
    };
  }
}
