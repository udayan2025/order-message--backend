import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ENV } from '../config/env';

export interface GeneratePdfParams {
  businessName: string;
  category: string;
  subject: string;
  catalogItems?: Array<{ name: string; category?: string; price?: number; unit?: string }>;
  currency?: string;
}

export interface PdfUploadResult {
  mediaUrl: string;
  localPath: string;
  fileName: string;
  pdfBuffer: Buffer;
}

export class PdfService {
  /**
   * Builds a valid, standard ISO 32000-1 PDF binary buffer in pure Node.js
   * Zero external binary dependencies, 100% compliant with Chrome, Adobe, iOS, and Android
   */
  public static buildPdfBuffer(params: GeneratePdfParams): { buffer: Buffer; fileName: string } {
    const { businessName, category, subject, catalogItems = [], currency = '₹' } = params;
    const catLower = (category || 'custom').toLowerCase().trim();
    // Dynamic category key for filename: "medicine", "gym", "grocery", "electronics", etc.
    const catKey = (catLower === 'pharmacy' || catLower === 'pharma' ? 'medicine' : catLower)
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '') || 'document';
    const timestamp = Date.now();
    const fileName = `${catKey}_pdf_${timestamp}.pdf`;

    const cleanBiz = (businessName || 'Business Hub').trim();
    const cleanSub = (subject || 'Digital Guide').trim();
    const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Generate dynamic textual sections according to requested topic & category
    const lowerSub = cleanSub.toLowerCase();
    const isMedicine = catLower === 'medicine' || catLower === 'pharmacy' || catLower === 'pharma' ||
      cleanBiz.toLowerCase().includes('pharmacy') || cleanBiz.toLowerCase().includes('pharma') || cleanBiz.toLowerCase().includes('med') ||
      lowerSub.includes('medicine') || lowerSub.includes('drug') || lowerSub.includes('prescription') || lowerSub.includes('dose') || lowerSub.includes('otc');

    const isGym = catLower === 'gym' || catLower === 'fitness' ||
      cleanBiz.toLowerCase().includes('gym') || cleanBiz.toLowerCase().includes('fit') ||
      lowerSub.includes('workout') || lowerSub.includes('exercise') || lowerSub.includes('fitness');

    const isDiet = lowerSub.includes('diet') || lowerSub.includes('nutrition') || lowerSub.includes('meal') || lowerSub.includes('food');
    const isTraining = lowerSub.includes('training') || lowerSub.includes('workout') || lowerSub.includes('exercise') || lowerSub.includes('routine');

    const isGrocery = catLower === 'grocery' || catLower === 'supermarket' ||
      cleanBiz.toLowerCase().includes('mart') || cleanBiz.toLowerCase().includes('fresh') || cleanBiz.toLowerCase().includes('grocery');

    const isElectronics = catLower === 'electronics' || catLower === 'tech' ||
      cleanBiz.toLowerCase().includes('gadget') || cleanBiz.toLowerCase().includes('electronics') || cleanBiz.toLowerCase().includes('tech');

    const isRestaurant = catLower === 'restaurant' || catLower === 'cafe' || catLower === 'food' ||
      cleanBiz.toLowerCase().includes('cafe') || cleanBiz.toLowerCase().includes('bistro') || cleanBiz.toLowerCase().includes('restaurant');

    const isSalon = catLower === 'salon' || catLower === 'spa' || catLower === 'beauty' ||
      cleanBiz.toLowerCase().includes('salon') || cleanBiz.toLowerCase().includes('spa');

    const sections: Array<{ title: string; lines: string[] }> = [];

    if (isMedicine) {
      sections.push({
        title: "1. OVER-THE-COUNTER (OTC) VS. PRESCRIPTION (RX) MEDICINES",
        lines: [
          "• Over-the-Counter (OTC): Safe for self-care of mild symptoms without a doctor prescription (e.g. Paracetamol, antacids, ORS, cetirizine)",
          "• Prescription Drugs (Rx): Require diagnosis & ongoing monitoring by a registered doctor (e.g. Antibiotics, cardiovascular, anti-diabetics)",
          "• Scheduled Drugs (Schedule H / X): Dispensed strictly on valid prescription; record keeping enforced by pharmacy regulations",
          "• Critical Safety Rule: Never discontinue or alter prescription medication doses without consulting your doctor"
        ]
      });
      sections.push({
        title: "2. COMMON DOSAGE FORMS & ADMINISTRATION PROTOCOLS",
        lines: [
          "• Oral Solid Dosage (Tablets / Capsules): Take with a full glass of water; swallow intact unless labeled chewable or dispersible",
          "• Oral Liquids (Syrups / Suspensions): Shake suspensions well before measuring; always use calibrated dosing syringes or spoons",
          "• Inhalers & Respules: Rinse mouth with water after inhaled corticosteroid usage to prevent oral irritation",
          "• Topicals (Ointments / Creams / Gels): Apply a thin, even film on clean, dry affected skin as prescribed"
        ]
      });
      sections.push({
        title: "3. SAFE STORAGE, EXPIRY & PATIENT GUIDELINES",
        lines: [
          "• Storage: Keep below 25°C away from direct sunlight, moisture, and strictly out of reach of children",
          "• Missed Dose: Take as soon as remembered, unless close to your next scheduled dose; never double up doses",
          "• Pharmacist Consultation: Consult our front desk pharmacist before combining supplements with prescription drugs"
        ]
      });
      if (catalogItems.length > 0) {
        sections.push({
          title: "4. ESSENTIAL PHARMACY STOCK & PRICING",
          lines: catalogItems.slice(0, 5).map(item =>
            `• ${item.name} (${item.category || 'Medicine'}) - ${currency}${Number(item.price || 0).toFixed(2)}${item.unit ? ' / ' + item.unit : ''}`
          )
        });
      }
    } else if (isDiet) {
      sections.push({
        title: "1. DAILY MACRONUTRIENT & CALORIC TARGETS",
        lines: [
          "• Target Intake: 2,150 - 2,400 kcal/day (Tailored for lean muscle & active metabolism)",
          "• Protein Target: 1.8g - 2.2g per kg of bodyweight (140g - 170g / day)",
          "• Complex Carbs: 210g - 250g (Oats, brown rice, sweet potatoes, quinoa)",
          "• Essential Healthy Fats: 50g - 65g (Almonds, peanut butter, olive oil, chia seeds)"
        ]
      });
      sections.push({
        title: "2. MEAL-BY-MEAL TIMING & RECOMMENDED CHOICES",
        lines: [
          "• 07:30 AM (Wake-up): 500ml warm water + 5 soaked almonds + 1 scoop Whey Isolate",
          "• 09:00 AM (Power Breakfast): 4 egg whites (2 whole) + oatmeal bowl with banana & chia seeds",
          "• 01:30 PM (Nutrient Lunch): Grilled chicken breast or paneer/tofu + 1.5 cups brown rice + green salad",
          "• 05:30 PM (Pre-Workout Fuel): 1 banana + 1 slice whole wheat peanut butter toast + black coffee",
          "• 07:30 PM (Post-Workout Recovery): 1 scoop Whey Protein in cold water + electrolyte hydration",
          "• 09:00 PM (Light Dinner): Steamed broccoli & bell peppers + grilled fish / soya chunks + quinoa"
        ]
      });
      sections.push({
        title: "3. HYDRATION & SUPPLEMENTATION GUIDELINES",
        lines: [
          "• Hydration Standard: Minimum 3.5 - 4.5 Litres of filtered water per day",
          "• Creatine Monohydrate: 3g - 5g daily post-workout for cellular ATP regeneration",
          "• Micronutrients: Daily multivitamin, Omega-3 fish oil, and Vitamin D3 (60k IU weekly)",
          "• Rest & Digestion: Sleep 7 - 8 hours uninterrupted for peak metabolic recovery"
        ]
      });
    } else if (isTraining || isGym) {
      sections.push({
        title: "1. 1-ON-1 TRAINING PROGRAM OVERVIEW",
        lines: [
          "• Target Focus: Progressive Overload, Hypertrophy & Athletic Functional Strength",
          "• Frequency: 4 Resistance Training Days + 2 Conditioning Days + 1 Active Rest Day",
          "• Warmup Protocol: 8 mins dynamic mobility (hip openers, thoracic rotations, band pull-aparts)",
          "• Safety: Strict form enforcement under certified trainer guidance"
        ]
      });
      sections.push({
        title: "2. WEEKLY WORKOUT & PROGRESSION SCHEDULE",
        lines: [
          "• Day 1 (Push - Chest/Shoulders/Triceps): Barbell Flat Bench (4x8), DB Incline (3x10), Lateral Raises (4x15)",
          "• Day 2 (Pull - Back/Biceps): Deadlift (4x6), Lat Pulldowns (3x10), Seated Cable Row (3x12), Bicep Curls (3x12)",
          "• Day 3 (Legs & Posterior Chain): Barbell Back Squats (4x8), Romanian Deadlift (3x10), Walking Lunges (3x12)",
          "• Day 4 (Upper Power Hypertrophy): Overhead Press (4x8), Incline DB Flies (3x12), Cable Tricep Pushdowns (3x15)",
          "• Day 5 (Cardio & Core Conditioning): HIIT Sprints (15 mins), Kettlebell Swings (4x20), Hanging Leg Raises (3x15)"
        ]
      });
      sections.push({
        title: "3. COACHING & PERFORMANCE MONITORING",
        lines: [
          "• Bi-weekly Body Composition Analysis (InBody Scanner / Caliper fat tracking)",
          "• Dedicated Form Audits & Personalized Weight Adjustments each microcycle",
          "• Direct Trainer WhatsApp support for form videos and recovery advice"
        ]
      });
    } else if (isGrocery) {
      sections.push({
        title: "1. FRESH PRODUCE & FARM-TO-SHELF QUALITY STANDARDS",
        lines: [
          "• Daily Fresh Harvest: Organic vegetables, seasonal fruits, and greens sourced directly from certified farms",
          "• Quality Inspection: Hand-graded, temperature-monitored produce to ensure peak nutritional crispness",
          "• Storage Tip: Keep greens dry and ventilated; store root vegetables in cool, dark pantry spaces"
        ]
      });
      sections.push({
        title: "2. PANTRY STAPLES, DAIRY & REFRIGERATION SAFETY",
        lines: [
          "• Dairy Protocols: Pasteurized milk, farm eggs, and fresh dairy maintained at strict 2°C - 4°C cold-chain standards",
          "• Whole Grains & Pulses: Vacuum-packed unpolished dals, premium basmati rice, and organic flours",
          "• Fast Home Delivery: Same-day express dispatch available directly via our WhatsApp catalog"
        ]
      });
      if (catalogItems.length > 0) {
        sections.push({
          title: "3. FEATURED STORE ITEMS & LIVE PRICES",
          lines: catalogItems.slice(0, 5).map(item =>
            `• ${item.name} (${item.category || 'Grocery'}) - ${currency}${Number(item.price || 0).toFixed(2)}${item.unit ? ' / ' + item.unit : ''}`
          )
        });
      }
    } else if (isElectronics) {
      sections.push({
        title: "1. DEVICE SPECIFICATIONS & AUTHENTICITY ASSURANCE",
        lines: [
          "• 100% Genuine Certified Hardware with original manufacturer seals and serial verification",
          "• Performance Testing: High-grade component testing, battery integrity audits, and firmware compliance",
          "• Accessories: Fast chargers, braided cables, and protective tempered glass available in-store"
        ]
      });
      sections.push({
        title: "2. OFFICIAL WARRANTY, CARE & SERVICE SUPPORT",
        lines: [
          "• Manufacturer Warranty: 1-Year comprehensive brand warranty + official invoice support",
          "• Battery Longevity: Avoid overnight charging above 80% to preserve lithium-ion battery health cycles",
          "• Repair & Replacement: Express counter diagnostics and authorized brand replacement assistance"
        ]
      });
      if (catalogItems.length > 0) {
        sections.push({
          title: "3. POPULAR GADGETS & LIVE INVENTORY",
          lines: catalogItems.slice(0, 5).map(item =>
            `• ${item.name} (${item.category || 'Electronics'}) - ${currency}${Number(item.price || 0).toFixed(2)}${item.unit ? ' / ' + item.unit : ''}`
          )
        });
      }
    } else if (isRestaurant) {
      sections.push({
        title: "1. CHEF'S SIGNATURE MENU & CULINARY HIGHLIGHTS",
        lines: [
          "• Artisanal Preparation: Made-to-order dishes using farm-fresh, seasonal herbs and premium ingredients",
          "• Hygiene & Safety: FSSAI-compliant kitchen standards with sanitized prep stations and filtered water",
          "• Dining & Takeaway: Dine-in table reservations, express curbside pickup, and hot doorstep delivery"
        ]
      });
      sections.push({
        title: "2. DIETARY CHOICES & ALLERGEN ADVICE",
        lines: [
          "• Custom Preparations: Gluten-free, vegan, low-sugar, and keto-friendly options available upon request",
          "• Allergen Warning: Please notify our kitchen staff about nut, dairy, or gluten sensitivities when ordering",
          "• Special Events & Catering: Custom party platters and celebratory meal bundles"
        ]
      });
      if (catalogItems.length > 0) {
        sections.push({
          title: "3. POPULAR MENU SELECTIONS & PRICING",
          lines: catalogItems.slice(0, 5).map(item =>
            `• ${item.name} (${item.category || 'Special'}) - ${currency}${Number(item.price || 0).toFixed(2)}`
          )
        });
      }
    } else if (isSalon) {
      sections.push({
        title: "1. PROFESSIONAL SALON SERVICES & BEAUTY MENU",
        lines: [
          "• Certified Stylists: Customized haircuts, keratin hair spa, scalp detox, and therapeutic facials",
          "• Premium Product Lines: Ammonia-free organic hair colors and dermatologist-tested skincare serums",
          "• Hygiene Protocol: Autoclave-sterilized tools, single-use disposable capes, and sanitized stations"
        ]
      });
      sections.push({
        title: "2. POST-TREATMENT AFTERCARE REGIMEN",
        lines: [
          "• Hair Care: Use sulfate-free shampoo for 72 hours post-coloring to preserve pigment vibrancy",
          "• Skin Protection: Apply broad-spectrum SPF 50+ sunscreen daily following professional facials or peels",
          "• Appointments: Pre-book your slot via WhatsApp for zero waiting time"
        ]
      });
      if (catalogItems.length > 0) {
        sections.push({
          title: "3. SERVICE PACKAGES & PRICING",
          lines: catalogItems.slice(0, 5).map(item =>
            `• ${item.name} (${item.category || 'Service'}) - ${currency}${Number(item.price || 0).toFixed(2)}`
          )
        });
      }
    } else {
      // General / Custom Business Catalog
      const itemLines = catalogItems.slice(0, 6).map((item) =>
        `• ${item.name} (${item.category || 'General'}) - ${currency}${Number(item.price || 0).toLocaleString()} ${item.unit ? '/ ' + item.unit : ''}`
      );
      sections.push({
        title: "1. OFFICIAL PRODUCTS & SERVICE DIRECTORY",
        lines: itemLines.length > 0 ? itemLines : [
          `• Standard Service Package - ${currency}1,499`,
          `• Annual Priority Support Pass - ${currency}12,999`,
          `• 1-on-1 Personalized Consultation - ${currency}4,500`
        ]
      });
      sections.push({
        title: "2. SERVICE ASSURANCE & CUSTOMER COMMITMENT",
        lines: [
          "• 100% Quality Guaranteed on all official orders and professional services",
          "• Dedicated Customer Assistance available directly on WhatsApp 24/7",
          "• Fast billing, transparent quotes, and immediate digital receipt generation"
        ]
      });
    }

    // Build PDF PostScript Drawing Stream
    const streamParts: string[] = [];

    // Helper to escape text in PDF string literal (...)
    const escapePdf = (str: string) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/[^\x20-\x7E]/g, ' '); // Keep safe printable ASCII
    };

    // 1. Draw Header Box (Dark Emerald Green #0f766e: 15/255, 118/255, 110/255)
    streamParts.push(`0.06 0.46 0.43 rg`);
    streamParts.push(`0 740 595.28 102 re f`); // Header rectangle

    // 2. Header Accent Line (Gold / Amber #f59e0b)
    streamParts.push(`0.96 0.62 0.04 rg`);
    streamParts.push(`0 736 595.28 4 re f`);

    // 3. Header Text
    streamParts.push(`BT`);
    streamParts.push(`/F2 20 Tf`);
    streamParts.push(`1 1 1 rg`); // White
    streamParts.push(`1 0 0 1 36 805 Tm`);
    streamParts.push(`(${escapePdf(cleanBiz.toUpperCase())}) Tj`);

    streamParts.push(`/F1 9 Tf`);
    streamParts.push(`0.85 0.95 0.92 rg`); // Pale green
    streamParts.push(`1 0 0 1 36 788 Tm`);
    streamParts.push(`(OFFICIAL DIGITAL DOCUMENT  |  CATEGORY: ${escapePdf(category.toUpperCase())}) Tj`);

    streamParts.push(`/F2 13 Tf`);
    streamParts.push(`1 0.95 0.8 rg`); // Soft gold
    streamParts.push(`1 0 0 1 36 765 Tm`);
    streamParts.push(`(DOCUMENT: ${escapePdf(cleanSub.toUpperCase())}) Tj`);

    streamParts.push(`/F1 8 Tf`);
    streamParts.push(`0.9 0.9 0.9 rg`);
    streamParts.push(`1 0 0 1 36 749 Tm`);
    streamParts.push(`(Issued: ${escapePdf(dateStr)} at ${escapePdf(timeStr)}  |  Ref: ${escapePdf(fileName)}) Tj`);
    streamParts.push(`ET`);

    // 4. Content Sections
    let currentY = 705;

    for (const sec of sections) {
      if (currentY < 120) break; // Don't overflow page bottom

      // Section Header Banner
      streamParts.push(`0.92 0.96 0.95 rg`);
      streamParts.push(`36 ${currentY - 4} 523 20 re f`); // Light container box

      streamParts.push(`0.06 0.46 0.43 rg`); // Left border accent
      streamParts.push(`36 ${currentY - 4} 4 20 re f`);

      streamParts.push(`BT`);
      streamParts.push(`/F2 10 Tf`);
      streamParts.push(`0.06 0.35 0.32 rg`); // Deep teal text
      streamParts.push(`1 0 0 1 46 ${currentY + 2} Tm`);
      streamParts.push(`(${escapePdf(sec.title)}) Tj`);
      streamParts.push(`ET`);

      currentY -= 20;

      // Section Lines
      for (const line of sec.lines) {
        if (currentY < 100) break;

        streamParts.push(`BT`);
        streamParts.push(`/F1 9 Tf`);
        streamParts.push(`0.15 0.18 0.22 rg`); // Charcoal text
        streamParts.push(`1 0 0 1 44 ${currentY} Tm`);

        // Check if line is long, wrap if necessary
        if (line.length > 95) {
          const cut = line.lastIndexOf(' ', 90);
          const part1 = line.slice(0, cut > 0 ? cut : 90);
          const part2 = '   ' + line.slice(cut > 0 ? cut + 1 : 90);
          streamParts.push(`(${escapePdf(part1)}) Tj`);
          streamParts.push(`ET`);
          currentY -= 13;
          streamParts.push(`BT`);
          streamParts.push(`/F1 9 Tf`);
          streamParts.push(`0.15 0.18 0.22 rg`);
          streamParts.push(`1 0 0 1 44 ${currentY} Tm`);
          streamParts.push(`(${escapePdf(part2)}) Tj`);
        } else {
          streamParts.push(`(${escapePdf(line)}) Tj`);
        }
        streamParts.push(`ET`);

        currentY -= 15;
      }

      currentY -= 10; // Extra margin between sections
    }

    // 5. Verification Badge & QR/Notice Card
    if (currentY > 100) {
      streamParts.push(`0.97 0.98 0.99 rg`);
      streamParts.push(`36 80 523 48 re f`);
      streamParts.push(`0.8 0.85 0.88 RG`);
      streamParts.push(`36 80 523 48 re S`);

      streamParts.push(`BT`);
      streamParts.push(`/F2 9 Tf`);
      streamParts.push(`0.06 0.46 0.43 rg`);
      streamParts.push(`1 0 0 1 48 112 Tm`);
      streamParts.push(`(VERIFIED STORE CERTIFICATE & AUTHENTICITY NOTICE) Tj`);

      streamParts.push(`/F1 8 Tf`);
      streamParts.push(`0.35 0.4 0.45 rg`);
      streamParts.push(`1 0 0 1 48 98 Tm`);
      streamParts.push(`(This document is officially generated by ${escapePdf(cleanBiz)} via MessageAPI WhatsApp Gateway.) Tj`);

      streamParts.push(`1 0 0 1 48 86 Tm`);
      streamParts.push(`(For inquiries, bookings or personalized adjustments, reply directly on WhatsApp.) Tj`);
      streamParts.push(`ET`);
    }

    // 6. Footer Line & Copyright
    streamParts.push(`0.85 0.88 0.9 RG`);
    streamParts.push(`36 40 523 0.5 re f`);

    streamParts.push(`BT`);
    streamParts.push(`/F1 7.5 Tf`);
    streamParts.push(`0.55 0.6 0.65 rg`);
    streamParts.push(`1 0 0 1 36 28 Tm`);
    streamParts.push(`(${escapePdf(cleanBiz)}  *  Document: ${escapePdf(fileName)}  *  Powered by MessageAPI Enterprise) Tj`);

    streamParts.push(`1 0 0 1 480 28 Tm`);
    streamParts.push(`(Page 1 of 1) Tj`);
    streamParts.push(`ET`);

    const streamContent = streamParts.join('\n');
    const streamLength = Buffer.byteLength(streamContent, 'utf-8');

    // Assemble PDF Object Tree
    const objects: string[] = [
      `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ProcSet [/PDF /Text] >> /Contents 6 0 R >>\nendobj\n`,
      `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
      `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
      `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    ];

    const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
    let offset = Buffer.byteLength(header, 'binary');
    const offsets: number[] = [];

    for (const obj of objects) {
      offsets.push(offset);
      offset += Buffer.byteLength(obj, 'utf-8');
    }

    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) {
      xref += `${o.toString().padStart(10, '0')} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;

    const fullPdf = header + objects.join('') + xref + trailer;
    const buffer = Buffer.from(fullPdf, 'binary');

    return { buffer, fileName };
  }

  /**
   * Uploads PDF buffer to Cloudinary (main priority) and saves fallback to local uploads/
   */
  public static async uploadPdfToCloudinaryOrLocal(
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<{ mediaUrl: string; localPath: string; fileName: string }> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    // 1. Save local copy in uploads/ folder
    if (!fs.existsSync(ENV.UPLOAD_DIR)) {
      fs.mkdirSync(ENV.UPLOAD_DIR, { recursive: true });
    }
    const localFilePath = path.join(ENV.UPLOAD_DIR, fileName);
    fs.writeFileSync(localFilePath, pdfBuffer);
    let finalMediaUrl = `/uploads/${fileName}`;

    // 2. MAIN PRIORITY: Upload PDF directly to Cloudinary into folder "whatsapp_gateway"
    if (cloudName) {
      try {
        console.log(`☁️ [Cloudinary] Uploading ${pdfBuffer.length} bytes PDF "${fileName}" to Cloudinary (${cloudName}/whatsapp_gateway)...`);

        const base64Data = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        const publicId = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        const folder = 'whatsapp_gateway';
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

        // Upload as raw resource to preserve 100% byte integrity
        let res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        });

        if (!res.ok) {
          // Fallback to auto upload
          res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
          });
        }

        if (res.ok) {
          const data: any = await res.json();
          if (data && data.secure_url) {
            finalMediaUrl = data.secure_url;
            console.log(`✅ [Cloudinary] PDF uploaded successfully to CDN in folder "whatsapp_gateway": ${finalMediaUrl}`);
          }
        } else {
          const errText = await res.text();
          console.warn(`⚠️ [Cloudinary] PDF upload notice (${res.status}): ${errText.slice(0, 150)}. Using local upload.`);
        }
      } catch (err: any) {
        console.warn('⚠️ [Cloudinary] PDF upload exception (using local upload fallback):', err.message);
      }
    } else {
      console.log('ℹ️ [PdfService] No CLOUDINARY_CLOUD_NAME configured. Stored in local uploads folder.');
    }

    return { mediaUrl: finalMediaUrl, localPath: localFilePath, fileName };
  }

  /**
   * Generates PDF and uploads to Cloudinary/local in one step
   */
  public static async generateAndUploadPdf(params: GeneratePdfParams): Promise<PdfUploadResult> {
    const { buffer, fileName } = this.buildPdfBuffer(params);
    const uploadRes = await this.uploadPdfToCloudinaryOrLocal(buffer, fileName);

    return {
      mediaUrl: uploadRes.mediaUrl,
      localPath: uploadRes.localPath,
      fileName: uploadRes.fileName,
      pdfBuffer: buffer
    };
  }
}
