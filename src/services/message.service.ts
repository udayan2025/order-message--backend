import path from 'path';
import fs from 'fs';
import { prisma } from '../config/database';
import { ENV } from '../config/env';
import { SessionService } from './session.service';
import { EventsService } from './events.service';
import { sleep, calculateRandomDelay } from '../utils/delay';
import { MessageSender, MessageType, MessageStatus } from '@prisma/client';

export class MessageService {
  private static formatJid(phone: string, defaultCountryCode = '91'): string {
    if (!phone) return '';
    if (phone.includes('@s.whatsapp.net') || phone.includes('@g.us') || phone.includes('@lid')) {
      return phone;
    }
    let clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return '';

    // Handle 0-prefixed 10-digit mobile numbers (e.g. 09876543210 -> 9876543210)
    if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.slice(1);
    }

    // Prepend default country code (e.g. 91) if user entered standard 10-digit number
    if (clean.length === 10) {
      clean = `${defaultCountryCode}${clean}`;
    }

    // WhatsApp LID accounts detection:
    // LIDs are 15-16 digit numbers typically starting with 200 or 1
    if (clean.startsWith('200') || (clean.length >= 15 && !clean.startsWith('91') && !clean.startsWith('86') && !clean.startsWith('1'))) {
      return `${clean}@lid`;
    }

    return `${clean}@s.whatsapp.net`;
  }

  public static async sendMessage(params: {
    businessId: string;
    sessionId: string;
    to: string;
    content: string;
    messageType?: 'text' | 'image' | 'audio' | 'document' | 'catalog' | 'location';
    mediaUrl?: string;
    location?: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
      isLive?: boolean;
      accuracy?: number;
      speed?: number;
      mapsUrl?: string;
    };
    antiBanPacing?: boolean;
    simulateTyping?: boolean;
  }) {
    const {
      businessId,
      sessionId,
      to,
      content,
      messageType = 'text',
      mediaUrl,
      location,
      antiBanPacing = true,
      simulateTyping = true
    } = params;

    let destinationPhone = to;
    // Check if `to` is a contact ID or matches existing contact
    const cleanTo = to.replace(/[^0-9]/g, '');
    const existingContact = await prisma.contact.findFirst({
      where: {
        businessId,
        OR: [
          { id: to },
          { phone: to },
          { phone: to.replace('@lid', '') },
          { phone: `+${cleanTo}` },
          { phone: `${cleanTo}@lid` },
          { phone: cleanTo }
        ]
      }
    });

    if (existingContact && existingContact.phone) {
      destinationPhone = existingContact.phone;
    }

    const jid = MessageService.formatJid(destinationPhone);
    const sessionManager = SessionService.getInstance();
    let sock = sessionManager.getSocket(sessionId);
    if (!sock) {
      sock = sessionManager.getSocket(); // Fallback to any connected socket
    }

    // 1. Upsert or find Contact in database
    const contact = existingContact || await prisma.contact.upsert({
      where: {
        businessId_phone: {
          businessId,
          phone: destinationPhone
        }
      },
      update: {
        lastSeenAt: new Date()
      },
      create: {
        businessId,
        phone: destinationPhone,
        name: `Contact ${destinationPhone.slice(-4)}`,
        tag: sessionId
      }
    });

    // Prepare location data if this is a location message
    let activeLocation = location;
    let effectiveMediaUrl = mediaUrl;
    let finalContent = content;

    if (messageType === 'location' || activeLocation) {
      if (!activeLocation && mediaUrl && mediaUrl.startsWith('{')) {
        try {
          activeLocation = JSON.parse(mediaUrl);
        } catch {}
      }
      if (activeLocation) {
        const mapsUrl = activeLocation.mapsUrl || `https://www.google.com/maps?q=${activeLocation.latitude},${activeLocation.longitude}`;
        activeLocation = {
          ...activeLocation,
          mapsUrl
        };
        effectiveMediaUrl = JSON.stringify({
          type: 'location',
          ...activeLocation
        });
        if (!finalContent || finalContent === 'Shared Location' || finalContent.startsWith('📍')) {
          finalContent = `📍 ${activeLocation.isLive ? '🔴 Live Location Shared' : 'Shared Location'}: ${activeLocation.name || 'Location'}${activeLocation.address ? `\n${activeLocation.address}` : ''}\n🗺️ Map: ${mapsUrl}`;
        }
      }
    }

    const sanitizedContent = finalContent
      ? finalContent.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/^---+$/gm, '').trim()
      : finalContent;

    // 2. Anti-Ban Simulation (Typing indicators & human presence)
    if (sock && simulateTyping && jid) {
      try {
        await sock.sendPresenceUpdate('composing', jid);
        const typingDelay = Math.min(Math.max(800, sanitizedContent.length * 30), 2000);
        await sleep(typingDelay);
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) {
        // Socket presence update error ignored
      }
    }

    let whatsappMessageId = `msg_${Date.now()}`;

    // 3. Dispatch actual message through Baileys socket if live
    if (sock && jid) {
      const outboundWhatsAppText = sanitizedContent
        ? sanitizedContent.replace(/\[BUY_PRODUCT:\s*\{[\s\S]*?\}\s*\]/gi, '').trim()
        : sanitizedContent;

      const msgPayload: any = {};
      if (messageType === 'image' && effectiveMediaUrl) {
        let imgBuffer: Buffer | null = null;
        if (effectiveMediaUrl.startsWith('data:image/')) {
          const commaIdx = effectiveMediaUrl.indexOf(',');
          if (commaIdx !== -1) {
            try {
              imgBuffer = Buffer.from(effectiveMediaUrl.slice(commaIdx + 1), 'base64');
            } catch {}
          }
        } else if (effectiveMediaUrl.startsWith('/uploads/') || effectiveMediaUrl.startsWith('uploads/')) {
          const filename = path.basename(effectiveMediaUrl);
          const localPath = path.join(ENV.UPLOAD_DIR, filename);
          if (fs.existsSync(localPath)) {
            try {
              imgBuffer = fs.readFileSync(localPath);
            } catch {}
          }
        }

        if (imgBuffer) {
          msgPayload.image = imgBuffer;
        } else {
          msgPayload.image = { url: effectiveMediaUrl };
        }
        msgPayload.caption = outboundWhatsAppText;
      } else if (messageType === 'audio' && effectiveMediaUrl) {
        msgPayload.audio = { url: effectiveMediaUrl };
        msgPayload.ptt = true;
      } else if (messageType === 'document' && effectiveMediaUrl) {
        msgPayload.document = { url: effectiveMediaUrl };
        msgPayload.mimetype = 'application/pdf';
        msgPayload.fileName = 'document.pdf';
        msgPayload.caption = outboundWhatsAppText;
      } else if ((messageType === 'location' || activeLocation) && activeLocation?.latitude !== undefined) {
        // Dispatch native WhatsApp location message via Baileys socket
        msgPayload.location = {
          degreesLatitude: activeLocation.latitude,
          degreesLongitude: activeLocation.longitude,
          name: activeLocation.name || 'Shared Location',
          address: activeLocation.address || ''
        };
      } else {
        msgPayload.text = outboundWhatsAppText;
      }

      try {
        let targetJid = jid;
        try {
          if (sock.onWhatsApp && !jid.endsWith('@lid') && !jid.endsWith('@g.us')) {
            const rawDigits = jid.split('@')[0];
            const waResults = await sock.onWhatsApp(rawDigits);
            if (waResults && waResults.length > 0 && waResults[0]?.exists && waResults[0]?.jid) {
              targetJid = waResults[0].jid;
            }
          }
        } catch (onWaErr: any) {
          // ignore verification error and fallback to jid
        }

        let sent;
        try {
          sent = await sock.sendMessage(targetJid, msgPayload);
        } catch (initialErr: any) {
          // If sending to @lid or @s.whatsapp.net failed, retry with alternate JID format
          const clean = targetJid.split('@')[0];
          const altJid = targetJid.endsWith('@lid') ? `${clean}@s.whatsapp.net` : `${clean}@lid`;
          console.warn(`⚠️ Socket dispatch to ${targetJid} failed (${initialErr.message}). Retrying with alternate JID: ${altJid}...`);
          sent = await sock.sendMessage(altJid, msgPayload);
        }

        if (sent?.key?.id) {
          whatsappMessageId = sent.key.id;
          SessionService.getInstance().markMessageAsSent(sent.key.id);
        }
        console.log(`🚀 [Baileys] Successfully dispatched message to WhatsApp (${targetJid}): "${sanitizedContent}"`);
      } catch (err: any) {
        console.warn(`❌ [Baileys] WhatsApp dispatch via socket failed for ${jid}:`, err.message);
      }
    } else {
      console.warn(`⚠️ [Baileys] No active WhatsApp socket available to dispatch to ${jid}. Available sockets: ${Array.from((sessionManager as any).activeSockets?.keys() || []).join(', ') || 'none'}`);
    }

    // 4. Save to ChatMessage database
    let dbMsgType: MessageType = MessageType.TEXT;
    if (messageType === 'image') dbMsgType = MessageType.IMAGE;
    else if (messageType === 'audio') dbMsgType = MessageType.AUDIO;
    else if (messageType === 'document') dbMsgType = MessageType.DOCUMENT;

    const dbMessage = await prisma.chatMessage.create({
      data: {
        contactId: contact.id,
        sender: MessageSender.business,
        text: sanitizedContent,
        messageType: dbMsgType,
        mediaUrl: effectiveMediaUrl || null,
        status: MessageStatus.SENT
      }
    });

    // 5. Broadcast to SSE clients for live UI update
    const resolvedOutboundType = (messageType === 'location' || activeLocation) ? 'location' : messageType;
    const messagePayload = {
      id: dbMessage.id,
      sender: 'business',
      text: sanitizedContent,
      messageType: resolvedOutboundType,
      location: activeLocation || undefined,
      mediaUrl: effectiveMediaUrl || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };

    const contactPayload = {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      avatarBg: 'bg-emerald-600',
      initials: (contact.name || 'User').slice(0, 2).toUpperCase(),
      lastMessage: (messageType === 'location' || activeLocation) ? '📍 Shared Location' : sanitizedContent,
      lastTime: messagePayload.timestamp,
      unreadCount: 0,
      isOnline: true,
      statusText: 'online'
    };

    EventsService.getInstance().broadcast('message:new', {
      sessionId,
      contactId: contact.id,
      contact: contactPayload,
      message: messagePayload
    }, { businessId });

    return {
      success: true,
      messageId: dbMessage.id,
      whatsappMessageId,
      status: 'SENT',
      location: activeLocation || undefined
    };
  }

  public static async getContacts(businessId: string, _sessionId?: string) {
    // Return all contacts for this business so conversations are preserved across sessions & reloads
    const contacts = await prisma.contact.findMany({
      where: { businessId },
      include: {
        messages: {
          take: 1,
          orderBy: { timestamp: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const rawContacts = contacts;

    // Retrieve any pinned message IDs for these contacts from chat_messages
    const contactIds = contacts.map((c) => c.id);
    let pinnedRows: any[] = [];
    if (contactIds.length > 0) {
      try {
        pinnedRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "contactId", id as "pinnedMessageId" FROM chat_messages WHERE "isPinned" = true AND "contactId" = ANY($1::text[])`,
          contactIds
        );
      } catch {}
    }

    const pinnedMap = new Map<string, string>();
    for (const row of pinnedRows) {
      pinnedMap.set(row.contactId, row.pinnedMessageId);
    }

    // Deduplicate contacts sharing the same phone digits so the sidebar stays clean
    const uniqueMap = new Map<string, typeof rawContacts[0]>();
    for (const c of rawContacts) {
      (c as any).pinnedMessageId = (c as any).pinnedMessageId || pinnedMap.get(c.id) || null;
      const key = c.phone.replace(/[^0-9]/g, '') || c.id;
      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, c);
      } else {
        const existingTime = existing.messages?.[0]?.timestamp ? new Date(existing.messages[0].timestamp).getTime() : 0;
        const currentTime = c.messages?.[0]?.timestamp ? new Date(c.messages[0].timestamp).getTime() : 0;
        if (currentTime > existingTime) {
          (c as any).pinnedMessageId = (c as any).pinnedMessageId || (existing as any).pinnedMessageId || null;
          uniqueMap.set(key, c);
        }
      }
    }

    return Array.from(uniqueMap.values());
  }

  public static async getContactMessages(contactId: string) {
    if (!contactId) return [];

    let decodedId = contactId;
    try {
      decodedId = decodeURIComponent(contactId).trim();
    } catch {
      decodedId = contactId.trim();
    }

    const cleanId = decodedId.replace(/[^0-9]/g, '');

    // Search contact by ID, exact name, fuzzy name, phone, or LID digits
    const searchConditions: any[] = [
      { id: decodedId },
      { name: decodedId },
      { name: { contains: decodedId, mode: 'insensitive' } },
      { phone: decodedId },
      { phone: decodedId.replace('@lid', '') }
    ];

    if (cleanId.length >= 4) {
      searchConditions.push(
        { phone: `+${cleanId}` },
        { phone: `${cleanId}@lid` },
        { phone: cleanId },
        { phone: { contains: cleanId } }
      );
    }

    const contact = await prisma.contact.findFirst({
      where: {
        OR: searchConditions
      }
    });

    const targetContactId = contact ? contact.id : decodedId;

    let allRelatedIds = [targetContactId];
    if (contact?.phone) {
      const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
      const relatedPhoneConditions: any[] = [
        { phone: contact.phone }
      ];
      if (cleanPhone.length >= 4) {
        relatedPhoneConditions.push({ phone: { contains: cleanPhone } });
      }

      const relatedContacts = await prisma.contact.findMany({
        where: {
          OR: relatedPhoneConditions
        },
        select: { id: true }
      });
      allRelatedIds = Array.from(new Set([targetContactId, ...relatedContacts.map((c) => c.id)]));
    }

    // Also link any contacts created under the same customer name across sessions
    if (contact?.name && contact.name.trim().length > 1 && !contact.name.toLowerCase().startsWith('customer')) {
      const nameMatched = await prisma.contact.findMany({
        where: {
          name: { equals: contact.name.trim(), mode: 'insensitive' }
        },
        select: { id: true }
      });
      allRelatedIds = Array.from(new Set([...allRelatedIds, ...nameMatched.map((c) => c.id)]));
    }

    const msgs = await prisma.chatMessage.findMany({
      where: {
        contactId: { in: allRelatedIds }
      },
      orderBy: { timestamp: 'asc' }
    });

    return msgs.map((m: any) => {
      let location = null;
      let resolvedType = (m.messageType || 'text').toLowerCase();

      if (m.mediaUrl) {
        try {
          if (m.mediaUrl.startsWith('{')) {
            const parsed = JSON.parse(m.mediaUrl);
            if (parsed.type === 'location' || (parsed.latitude !== undefined && parsed.longitude !== undefined)) {
              location = parsed;
              resolvedType = 'location';
            }
          }
        } catch {}
      }

      if (!location && m.text) {
        const coordMatch = m.text.match(/(?:maps\.google\.com\/\?q=|coordinates\s*[:=]?\s*)(-?\d+\.\d+),\s*(-?\d+\.\d+)/i);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lng = parseFloat(coordMatch[2]);
          const isLive = /live\s*location|live\s*tracking/i.test(m.text);
          location = {
            type: 'location',
            latitude: lat,
            longitude: lng,
            name: isLive ? 'Live Tracking' : 'Shared Location',
            address: '',
            isLive,
            mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`
          };
          resolvedType = 'location';
        }
      }

      return {
        ...m,
        messageType: resolvedType,
        location,
        isPinned: Boolean(m.isPinned)
      };
    });
  }

  /**
   * Send WhatsApp Geo Location or Live Tracking pin (Uber / Rapido / WhatsApp style)
   */
  public static async sendLocation(params: {
    businessId: string;
    sessionId: string;
    to: string;
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    isLive?: boolean;
    accuracy?: number;
    speed?: number;
  }) {
    const {
      businessId,
      sessionId,
      to,
      latitude,
      longitude,
      name = 'Shared Location',
      address = '',
      isLive = false,
      accuracy = 10,
      speed = 0
    } = params;

    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const locationData = {
      type: 'location',
      latitude: Number(latitude),
      longitude: Number(longitude),
      name,
      address,
      isLive: Boolean(isLive),
      accuracy: Number(accuracy),
      speed: Number(speed),
      mapsUrl,
      sharedAt: new Date().toISOString()
    };

    const content = `📍 ${isLive ? '🔴 Live Location Shared' : 'Shared Location'}: ${name}${address ? `\n${address}` : ''}\n🗺️ Map: ${mapsUrl}`;

    return MessageService.sendMessage({
      businessId,
      sessionId,
      to,
      content,
      messageType: 'location',
      location: locationData,
      mediaUrl: JSON.stringify(locationData),
      antiBanPacing: true,
      simulateTyping: true
    });
  }

  /**
   * Fetch the most recent shared location for a given contact
   */
  public static async getLatestContactLocation(businessId: string, contactId: string) {
    const messages = await MessageService.getContactMessages(contactId);
    const locationMsgs = messages.filter((m: any) => m.location || m.messageType === 'location');
    if (locationMsgs.length === 0) {
      return { success: false, location: null, message: 'No location shared for this contact yet' };
    }
    const latest = locationMsgs[locationMsgs.length - 1];
    return {
      success: true,
      location: latest.location,
      messageId: latest.id,
      timestamp: latest.timestamp,
      sender: latest.sender
    };
  }

  public static async togglePinMessage(params: {
    businessId: string;
    contactId: string;
    messageId: string;
    isPinned?: boolean;
  }) {
    const { businessId, contactId, messageId } = params;
    if (!messageId || !contactId) {
      return { success: false, error: 'messageId and contactId are required' };
    }

    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!msg) {
      return { success: false, error: 'Message not found' };
    }

    const currentPinned = Boolean((msg as any).isPinned);
    const nextPinnedState = typeof params.isPinned === 'boolean' ? params.isPinned : !currentPinned;

    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { id: contactId },
          { id: msg.contactId },
          { phone: contactId }
        ]
      }
    });

    const targetContactId = contact ? contact.id : msg.contactId;

    let relatedIds = [targetContactId];
    if (contact?.phone) {
      const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
      const related = await prisma.contact.findMany({
        where: {
          OR: [
            { phone: contact.phone },
            ...(cleanPhone.length >= 4 ? [{ phone: { contains: cleanPhone } }] : [])
          ]
        },
        select: { id: true }
      });
      relatedIds = Array.from(new Set([targetContactId, ...related.map((c) => c.id)]));
    }

    if (nextPinnedState) {
      // 1. Unpin any currently pinned messages for this contact (strictly only 1 message can be pinned)
      try {
        await prisma.chatMessage.updateMany({
          where: { contactId: { in: relatedIds } },
          data: { isPinned: false }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `UPDATE chat_messages SET "isPinned" = false WHERE "contactId" = ANY($1::text[])`,
          relatedIds
        ).catch(() => null);
      }

      // 2. Pin this specific message
      try {
        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { isPinned: true }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `UPDATE chat_messages SET "isPinned" = true WHERE id = $1`,
          messageId
        ).catch(() => null);
      }

      // 3. Store pinnedMessageId on contacts table
      try {
        await prisma.contact.updateMany({
          where: { id: { in: relatedIds } },
          data: { pinnedMessageId: messageId }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `UPDATE contacts SET "pinnedMessageId" = $1 WHERE id = ANY($2::text[])`,
          messageId,
          relatedIds
        ).catch(() => null);
      }
    } else {
      // Unpin this message
      try {
        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { isPinned: false }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `UPDATE chat_messages SET "isPinned" = false WHERE id = $1`,
          messageId
        ).catch(() => null);
      }

      // Clear pinnedMessageId on contacts table
      try {
        await prisma.contact.updateMany({
          where: { id: { in: relatedIds } },
          data: { pinnedMessageId: null }
        });
      } catch {
        await prisma.$executeRawUnsafe(
          `UPDATE contacts SET "pinnedMessageId" = NULL WHERE id = ANY($1::text[])`,
          relatedIds
        ).catch(() => null);
      }
    }

    // Broadcast SSE live pin update
    EventsService.getInstance().broadcast('message:pin', {
      contactId: targetContactId,
      messageId: nextPinnedState ? messageId : null,
      isPinned: nextPinnedState
    }, { businessId });

    return {
      success: true,
      messageId,
      isPinned: nextPinnedState,
      pinnedMessageId: nextPinnedState ? messageId : null
    };
  }

  public static async deleteContact(businessId: string, contactId: string) {
    if (!contactId) return { success: false, error: 'Contact ID required' };

    const cleanId = contactId.replace(/[^0-9]/g, '');
    const contact = await prisma.contact.findFirst({
      where: {
        businessId,
        OR: [
          { id: contactId },
          { phone: contactId },
          { phone: contactId.replace('@lid', '') },
          { phone: `+${cleanId}` },
          { phone: `${cleanId}@lid` },
          { phone: cleanId }
        ]
      }
    });

    const targetContactId = contact ? contact.id : contactId;
    let allRelatedIds = [targetContactId];
    if (contact?.phone) {
      const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
      const relatedContacts = await prisma.contact.findMany({
        where: {
          businessId,
          OR: [
            { phone: contact.phone },
            { phone: { contains: cleanPhone } }
          ]
        },
        select: { id: true }
      });
      allRelatedIds = Array.from(new Set([targetContactId, ...relatedContacts.map((c) => c.id)]));
    }

    await prisma.chatMessage.deleteMany({
      where: { contactId: { in: allRelatedIds } }
    });

    await prisma.contact.deleteMany({
      where: { id: { in: allRelatedIds } }
    });

    return { success: true, deletedIds: allRelatedIds };
  }

  public static async deleteMessages(businessId: string, messageIds: string[]) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return { success: false, count: 0 };
    }

    const result = await prisma.chatMessage.deleteMany({
      where: {
        id: { in: messageIds }
      }
    });

    return { success: true, count: result.count };
  }

  /**
   * Simulates an inbound customer message, processes it through ErpService RAG & Catalog matcher,
   * stores both the customer inquiry and AI reply in PostgreSQL, and broadcasts via SSE.
   */
  public static async simulateInbound(params: {
    businessId: string;
    contactId: string;
    text: string;
  }) {
    const { businessId, contactId, text } = params;

    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        businessId
      }
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    });

    if (!business) {
      throw new Error('Business account not found');
    }

    // 1. Save customer inquiry
    const customerMsg = await prisma.chatMessage.create({
      data: {
        contactId: contact.id,
        sender: MessageSender.customer,
        text,
        messageType: MessageType.TEXT,
        status: MessageStatus.DELIVERED
      }
    });

    const eventsService = EventsService.getInstance();

    // Broadcast customer message
    eventsService.broadcast('message:new', {
      contactId: contact.id,
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        lastMessage: text,
        unreadCount: 0
      },
      message: {
        id: customerMsg.id,
        sender: 'customer',
        text,
        messageType: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'read'
      }
    }, { businessId });

    // 2. Query ErpService (checks CatalogItem, RAG Knowledge Base, formatting with Buy Button)
    const { ErpService } = await import('./erp.service');
    const erpReply = await ErpService.queryErp({
      businessId,
      query: text
    });

    const finalAiReply = (erpReply.aiGeneratedReply || '')
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/^---+$/gm, '')
      .trim();

    const isImage = erpReply.messageType === 'image' && !!erpReply.mediaUrl;
    const replyType = isImage ? MessageType.IMAGE : MessageType.TEXT;

    // 3. Save AI reply in database
    const botMsg = await prisma.chatMessage.create({
      data: {
        contactId: contact.id,
        sender: MessageSender.business,
        text: finalAiReply,
        messageType: replyType,
        mediaUrl: erpReply.mediaUrl || null,
        isAiGenerated: true,
        status: MessageStatus.SENT
      }
    });

    // 4. Broadcast AI reply via SSE
    eventsService.broadcast('message:new', {
      contactId: contact.id,
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        lastMessage: finalAiReply,
        unreadCount: 0
      },
      message: {
        id: botMsg.id,
        sender: 'business',
        text: finalAiReply,
        messageType: isImage ? 'image' : 'text',
        mediaUrl: erpReply.mediaUrl || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiGenerated: true,
        status: 'sent'
      }
    }, { businessId });

    return {
      customerMessage: customerMsg,
      botReply: botMsg,
      matchedProduct: erpReply.matchedProduct
    };
  }
}
