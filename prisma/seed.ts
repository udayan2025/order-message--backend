import { PrismaClient, BusinessCategory, SessionStatus, MessageSender, MessageType, MessageStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Apollo Pharma Demo Account
  const pharmacy = await prisma.businessAccount.upsert({
    where: { apiKey: 'msgapi_live_med_88921a99' },
    update: {},
    create: {
      id: 'biz_apollo_pharma',
      businessName: 'Lifeline Medico & Healthcare',
      category: BusinessCategory.medicine,
      categoryLabel: 'Medicine & Pharmacy Shop',
      ownerName: 'Dr. Rajesh Sharma',
      phone: '+919876543210',
      email: 'contact@lifelinemedico.com',
      address: 'Shop 14, Central Market, MG Road',
      currency: '₹',
      workingHours: '08:00 AM - 11:00 PM (Everyday)',
      greetingMessage: '👋 Welcome to Lifeline Medico! Send your prescription photo or medicine name to check availability and place an order.',
      aiPersonaPrompt: 'You are an empathetic, certified pharmacy assistant for Lifeline Medico. You check medicine stock, advise caution, and calculate totals.',
      minDelaySeconds: 8,
      maxDelaySeconds: 18,
      typingSimulation: true,
      typingSpeedWpm: 65,
      enableAi: true,
      enableStockQueries: true,
      allowedChats: '*',
      apiKey: 'msgapi_live_med_88921a99',
      webhookUrl: 'https://api.lifelinemedico.com/webhooks/whatsapp',
      catalog: {
        create: [
          { sku: 'MED-001', name: 'Paracetamol 650mg (Dolo)', category: 'Fever & Pain', price: 32.0, stock: 120, unit: 'strip', description: '15 tablets per strip', isAvailable: true },
          { sku: 'MED-002', name: 'Amoxicillin 500mg Capsules', category: 'Antibiotics', price: 115.0, stock: 45, unit: 'strip', description: '10 capsules per strip (Rx required)', isAvailable: true },
          { sku: 'MED-003', name: 'Vitamin C + Zinc Chewable', category: 'Supplements', price: 95.0, stock: 80, unit: 'bottle', description: '60 chewable tablets', isAvailable: true },
          { sku: 'MED-004', name: 'Digital Infrared Thermometer', category: 'Medical Devices', price: 850.0, stock: 15, unit: 'pcs', description: 'Non-contact fast reading', isAvailable: true },
          { sku: 'MED-005', name: 'Antiseptic Disinfectant Liquid 500ml', category: 'First Aid', price: 160.0, stock: 35, unit: 'bottle', description: 'Antibacterial antiseptic', isAvailable: true }
        ]
      },
      sessions: {
        create: {
          id: 'wa_primary_01',
          name: 'Primary Store Desk',
          phoneNumber: '+919876543210',
          status: SessionStatus.CONNECTED,
          isPrimary: true,
          deviceModel: 'WhatsApp Web Multi-Device',
          batteryPercent: 92,
          latencyMs: 34
        }
      }
    }
  });

  // Seed sample contact & messages for Apollo Pharma
  const contact = await prisma.contact.upsert({
    where: {
      businessId_phone: {
        businessId: pharmacy.id,
        phone: '+919876543210'
      }
    },
    update: {},
    create: {
      businessId: pharmacy.id,
      name: 'Rahul Sharma',
      phone: '+919876543210',
      tag: 'Active Inquiry',
      unreadCount: 0,
      isOnline: true,
      messages: {
        create: [
          {
            sender: MessageSender.customer,
            text: 'Hello, do you have Paracetamol 650mg available?',
            messageType: MessageType.TEXT,
            status: MessageStatus.READ
          },
          {
            sender: MessageSender.business,
            text: '✅ Paracetamol 650mg (Dolo) is in stock! Price is ₹32.00 per strip (15 tablets). We have 120 strips available. Would you like to order?',
            messageType: MessageType.TEXT,
            isAiGenerated: true,
            status: MessageStatus.DELIVERED
          }
        ]
      }
    }
  });

  // 2. IronFit Gym Demo Account
  await prisma.businessAccount.upsert({
    where: { apiKey: 'msgapi_live_gym_44319b22' },
    update: {},
    create: {
      id: 'biz_iron_gym',
      businessName: 'IronFit Premium Gym & Crossfit',
      category: BusinessCategory.gym,
      categoryLabel: 'Gym & Fitness Club',
      ownerName: 'Vikram Singh',
      phone: '+919822311223',
      email: 'info@ironfitgym.in',
      address: '3rd Floor, Apex Tower, Ring Road',
      currency: '₹',
      workingHours: '06:00 AM - 10:00 PM (Mon-Sat)',
      greetingMessage: '💪 Welcome to IronFit Gym! Ask about membership plans, personal trainer bookings, or gym timings.',
      aiPersonaPrompt: 'You are a motivating fitness consultant for IronFit Gym. You answer membership questions, trainer slots, and workout schedules.',
      minDelaySeconds: 6,
      maxDelaySeconds: 15,
      typingSimulation: true,
      typingSpeedWpm: 70,
      enableAi: true,
      enableStockQueries: true,
      allowedChats: '*',
      apiKey: 'msgapi_live_gym_44319b22',
      catalog: {
        create: [
          { sku: 'GYM-M01', name: 'Monthly Fitness Membership', category: 'Memberships', price: 1499.0, stock: 999, unit: 'month', description: 'Full gym & cardio access', isAvailable: true },
          { sku: 'GYM-Q01', name: 'Quarterly (3 Months) Pass', category: 'Memberships', price: 3899.0, stock: 999, unit: 'quarter', description: 'Includes diet consultation', isAvailable: true },
          { sku: 'GYM-A01', name: 'Annual VIP Transformation', category: 'Memberships', price: 12999.0, stock: 999, unit: 'year', description: 'All-inclusive + personal trainer trial', isAvailable: true },
          { sku: 'GYM-SUP01', name: '100% Gold Standard Whey 2kg', category: 'Supplements', price: 4999.0, stock: 8, unit: 'tub', description: 'Double rich chocolate isolate', isAvailable: true }
        ]
      },
      sessions: {
        create: {
          id: 'wa_gym_01',
          name: 'Front Desk WhatsApp',
          phoneNumber: '+919822311223',
          status: SessionStatus.CONNECTED,
          isPrimary: true,
          deviceModel: 'WhatsApp Web Multi-Device',
          batteryPercent: 85,
          latencyMs: 40
        }
      }
    }
  });

  console.log('✅ Seed completed successfully! Seeded accounts:', pharmacy.businessName);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
