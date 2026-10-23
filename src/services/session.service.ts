import EventEmitter from 'events';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  ConnectionState,
  WASocket,
  makeCacheableSignalKeyStore,
  WAMessageKey
} from '@whiskeysockets/baileys';
import { prisma } from '../config/database';
import { ENV } from '../config/env';
import { SessionStatus } from '@prisma/client';

function createMemoryCache() {
  const map = new Map<string, any>();
  return {
    get: <T>(key: string): T | undefined => map.get(key),
    set: <T>(key: string, value: T): void => { map.set(key, value); },
    del: (key: string): void => { map.delete(key); },
    flushAll: (): void => { map.clear(); }
  };
}

export class SessionService extends EventEmitter {
  private static instance: SessionService;
  private activeSockets: Map<string, WASocket> = new Map();
  private qrCache: Map<string, string> = new Map();
  private sentMessageIds: Set<string> = new Set();
  private logger = pino({ level: 'silent' });

  private constructor() {
    super();
    // Ensure auth sessions directory exists
    if (!fs.existsSync(ENV.SESSION_AUTH_DIR)) {
      fs.mkdirSync(ENV.SESSION_AUTH_DIR, { recursive: true });
    }
  }

  public static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  public getSocket(sessionId?: string): WASocket | undefined {
    if (sessionId && this.activeSockets.has(sessionId)) {
      const s = this.activeSockets.get(sessionId);
      if (s && (s as any).user) return s;
    }
    // Fallback: Search for any active socket that has a connected user session
    for (const [id, s] of this.activeSockets.entries()) {
      if (s && (s as any).user) {
        return s;
      }
    }
    // Fallback: Return requested socket if exists, else first available
    if (sessionId && this.activeSockets.has(sessionId)) {
      return this.activeSockets.get(sessionId);
    }
    for (const [id, s] of this.activeSockets.entries()) {
      if (s) return s;
    }
    return undefined;
  }

  public getCachedQr(sessionId: string): string | undefined {
    return this.qrCache.get(sessionId);
  }

  public markMessageAsSent(messageId: string): void {
    if (!messageId) return;
    this.sentMessageIds.add(messageId);
    setTimeout(() => {
      this.sentMessageIds.delete(messageId);
    }, 60000);
  }

  public isMessageSentByMe(messageId: string): boolean {
    if (!messageId) return false;
    return this.sentMessageIds.has(messageId);
  }

  public async listSessions(businessId?: string) {
    return prisma.whatsAppSession.findMany({
      where: businessId ? { businessId } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }

  public async getSessionById(sessionId: string) {
    return prisma.whatsAppSession.findUnique({
      where: { id: sessionId }
    });
  }

  public async initSession(params: {
    sessionId: string;
    sessionName: string;
    businessId: string;
    isPrimary?: boolean;
  }): Promise<{ sessionId: string; status: SessionStatus }> {
    const { sessionId, sessionName, businessId, isPrimary } = params;

    // Check or upsert session in database
    await prisma.whatsAppSession.upsert({
      where: { id: sessionId },
      update: {
        name: sessionName,
        status: SessionStatus.CONNECTING,
        isPrimary: isPrimary ?? false
      },
      create: {
        id: sessionId,
        businessId,
        name: sessionName,
        status: SessionStatus.CONNECTING,
        isPrimary: isPrimary ?? false
      }
    });

    const sessionPath = path.join(ENV.SESSION_AUTH_DIR, sessionId);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Close any previous socket for this session before creating a fresh one
    const existingSocket = this.activeSockets.get(sessionId);
    if (existingSocket) {
      this.activeSockets.delete(sessionId);
      try {
        existingSocket.end(undefined);
      } catch (e) {}
    }
    this.qrCache.delete(sessionId);

    try {
      // Auto-purge any corrupted session key files that triggered Bad MAC
      try {
        if (fs.existsSync(sessionPath)) {
          const authFiles = fs.readdirSync(sessionPath);
          for (const f of authFiles) {
            if (f.includes('196924284121325') && (f.startsWith('session-') || f.startsWith('sender-key-'))) {
              console.log(`🧹 [Signal Fix] Auto-purged bad MAC session key file: ${f}`);
              try { fs.unlinkSync(path.join(sessionPath, f)); } catch {}
            }
          }
        }
      } catch {}

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1015901307] as [number, number, number],
        isLatest: false
      }));

      console.log(`Connecting WhatsApp session "${sessionId}" via Baileys v${version.join('.')}...`);

      const memoryCache = createMemoryCache();
      const retryCache = createMemoryCache();

      const socket = makeWASocket({
        version,
        logger: this.logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger, memoryCache)
        },
        msgRetryCounterCache: retryCache,
        getMessage: async (key: WAMessageKey) => {
          if (key.id) {
            try {
              const stored = await prisma.chatMessage.findUnique({
                where: { id: key.id }
              });
              if (stored?.text) {
                return { conversation: stored.text };
              }
            } catch {}
          }
          return undefined;
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: undefined
      });

      this.activeSockets.set(sessionId, socket);

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        // Prevent race condition from superseded sockets
        if (this.activeSockets.get(sessionId) !== socket) {
          return;
        }

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            console.log(`\n==========================================================`);
            console.log(`📱 LIVE WHATSAPP QR CODE GENERATED FOR SESSION: ${sessionId}`);
            console.log(`👉 Scan with WhatsApp on your phone: Linked Devices > Link a Device`);
            console.log(`==========================================================\n`);

            // Also render visual QR directly in terminal
            QRCode.toString(qr, { type: 'terminal', small: true }, (err, terminalStr) => {
              if (!err && terminalStr) {
                console.log(terminalStr);
              }
            });

            const qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 360,
              color: { dark: '#000000', light: '#ffffff' }
            });
            this.qrCache.set(sessionId, qrDataUrl);
            this.emit(`qr:${sessionId}`, { qr: qrDataUrl, rawQr: qr, expireInSeconds: 30 });
            await prisma.whatsAppSession.update({
              where: { id: sessionId },
              data: { qrCode: qrDataUrl, status: SessionStatus.CONNECTING }
            }).catch(() => null);
          } catch (err) {
            console.error('Failed to generate QR Data URL:', err);
          }
        }

        if (connection === 'close') {
          // If this socket was superseded, ignore
          if (this.activeSockets.get(sessionId) !== socket) {
            return;
          }

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`📡 [Baileys] Socket closed for session "${sessionId}" (status code: ${statusCode || 'unknown'}).`);

          if (isLoggedOut) {
            console.log(`🚪 [Baileys] Session "${sessionId}" was logged out from WhatsApp.`);
            this.qrCache.delete(sessionId);
            this.activeSockets.delete(sessionId);
            const sessionPath = path.join(ENV.SESSION_AUTH_DIR, sessionId);
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
            }
            await prisma.whatsAppSession.update({
              where: { id: sessionId },
              data: { status: SessionStatus.DISCONNECTED, qrCode: null }
            }).catch(() => null);

            this.emit(`status:${sessionId}`, {
              status: SessionStatus.DISCONNECTED,
              reason: 'LOGGED_OUT'
            });

            // Broadcast real-time SSE event to all connected clients
            try {
              const { EventsService } = await import('./events.service');
              EventsService.getInstance().broadcast('session:status', {
                sessionId,
                status: SessionStatus.DISCONNECTED,
                phoneNumber: null,
                reason: 'LOGGED_OUT'
              }, { businessId });
            } catch (e) {}
            return;
          }

          // In all other cases (restartRequired code 515 after scan, 428 refresh, 408 timeout, network reconnect):
          // Maintain the pairing window / active session!
          const isRestart = statusCode === DisconnectReason.restartRequired;
          const delay = isRestart ? 500 : 2500;

          if (isRestart) {
            console.log(`🔄 [Baileys] Restart required for session "${sessionId}" (phone scanned / handshake accepted). Finalizing link in ${delay}ms...`);
          } else {
            console.log(`🔄 [Baileys] Maintaining session "${sessionId}" connection. Auto-reconnecting in ${delay}ms...`);
          }

          setTimeout(() => {
            if (this.activeSockets.get(sessionId) === socket || !this.activeSockets.has(sessionId)) {
              this.initSession(params).catch((err) => {
                console.error(`Error auto-reconnecting session ${sessionId}:`, err);
              });
            }
          }, delay);
        } else if (connection === 'open') {
          this.qrCache.delete(sessionId);
          const phoneNumber = socket.user?.id?.split(':')[0] || '';

          await prisma.whatsAppSession.update({
            where: { id: sessionId },
            data: {
              status: SessionStatus.CONNECTED,
              phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
              lastConnectedAt: new Date(),
              qrCode: null
            }
          });

          this.emit(`status:${sessionId}`, {
            status: SessionStatus.CONNECTED,
            phoneNumber: `+${phoneNumber}`,
            deviceModel: 'WhatsApp Web Multi-Device'
          });

          // Broadcast real-time SSE event to all connected clients
          try {
            const { EventsService } = await import('./events.service');
            EventsService.getInstance().broadcast('session:status', {
              sessionId,
              status: SessionStatus.CONNECTED,
              phoneNumber: `+${phoneNumber}`
            }, { businessId });
          } catch (e) {}

          console.log(`\n==========================================================`);
          console.log(`🎉 SUCCESS! WhatsApp session "${sessionId}" is CONNECTED!`);
          console.log(`📱 Linked Phone Number: +${phoneNumber}`);
          console.log(`==========================================================\n`);
        }
      });

      // Handle Inbound and Outbound Messages from Real WhatsApp Device
      socket.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          const rawJid = msg.key.remoteJid || '';
          if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us')) continue;

          // Ignore echo of messages dispatched by this gateway socket
          if (msg.key?.id && this.isMessageSentByMe(msg.key.id)) {
            this.sentMessageIds.delete(msg.key.id);
            continue;
          }

          const isFromMe = !!msg.key.fromMe;
          const normalizedJid = rawJid.replace(/:.*@/, '@');
          const cleanDigits = normalizedJid.split('@')[0].replace(/[^0-9]/g, '');
          const isLid = normalizedJid.endsWith('@lid') || cleanDigits.startsWith('200') || (cleanDigits.length >= 15 && !cleanDigits.startsWith('91') && !cleanDigits.startsWith('86'));
          const senderPhone = isLid ? `${cleanDigits}@lid` : (cleanDigits ? `+${cleanDigits}` : `+${rawJid.split('@')[0]}`);
          const senderName = isFromMe ? 'You (Store)' : (msg.pushName || (isLid ? 'WhatsApp Contact' : senderPhone));

          const rawMsg = msg.message;
          const audioMessage =
            rawMsg?.audioMessage ||
            (rawMsg as any)?.ephemeralMessage?.message?.audioMessage ||
            (rawMsg as any)?.viewOnceMessage?.message?.audioMessage ||
            (rawMsg as any)?.viewOnceMessageV2?.message?.audioMessage;

          const locationMessage =
            rawMsg?.locationMessage ||
            (rawMsg as any)?.ephemeralMessage?.message?.locationMessage ||
            (rawMsg as any)?.viewOnceMessage?.message?.locationMessage ||
            (rawMsg as any)?.viewOnceMessageV2?.message?.locationMessage;

          const liveLocationMessage =
            rawMsg?.liveLocationMessage ||
            (rawMsg as any)?.ephemeralMessage?.message?.liveLocationMessage ||
            (rawMsg as any)?.viewOnceMessage?.message?.liveLocationMessage ||
            (rawMsg as any)?.viewOnceMessageV2?.message?.liveLocationMessage;

          let isVoiceInbound = false;
          let isLocationInbound = false;
          let locationPayload: any = null;
          let inboundMediaUrl: string | undefined = undefined;
          let nativeButtonReplyId = '';
          const interactiveMsg = (rawMsg as any)?.interactiveResponseMessage;
          if (interactiveMsg?.nativeFlowResponseMessage?.paramsJson) {
            try {
              const parsed = JSON.parse(interactiveMsg.nativeFlowResponseMessage.paramsJson);
              nativeButtonReplyId = parsed.id || parsed.selectedId || '';
            } catch {}
          }

          let messageText =
            nativeButtonReplyId ||
            rawMsg?.buttonsResponseMessage?.selectedDisplayText ||
            rawMsg?.templateButtonReplyMessage?.selectedDisplayText ||
            rawMsg?.conversation ||
            rawMsg?.extendedTextMessage?.text ||
            rawMsg?.imageMessage?.caption ||
            rawMsg?.videoMessage?.caption ||
            rawMsg?.documentMessage?.caption ||
            rawMsg?.buttonsResponseMessage?.selectedButtonId ||
            rawMsg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            rawMsg?.templateButtonReplyMessage?.selectedId ||
            (rawMsg as any)?.ephemeralMessage?.message?.conversation ||
            (rawMsg as any)?.ephemeralMessage?.message?.extendedTextMessage?.text ||
            (rawMsg as any)?.ephemeralMessage?.message?.imageMessage?.caption ||
            (rawMsg as any)?.viewOnceMessage?.message?.conversation ||
            (rawMsg as any)?.viewOnceMessage?.message?.extendedTextMessage?.text ||
            (rawMsg as any)?.viewOnceMessageV2?.message?.conversation ||
            (rawMsg as any)?.viewOnceMessageV2?.message?.extendedTextMessage?.text ||
            '';

          let queryForAi = messageText;

          // If incoming message is a WhatsApp Location Share or Live Location Tracking (Uber/Rapido style)
          if (locationMessage || liveLocationMessage) {
            isLocationInbound = true;
            const lat = Number(locationMessage?.degreesLatitude ?? liveLocationMessage?.degreesLatitude ?? 0);
            const lng = Number(locationMessage?.degreesLongitude ?? liveLocationMessage?.degreesLongitude ?? 0);
            const isLive = Boolean(liveLocationMessage || locationMessage?.isLive);
            const locName = locationMessage?.name || (isLive ? 'Customer Live Tracking' : 'Customer Shared Location');
            const locAddress = locationMessage?.address || liveLocationMessage?.caption || '';
            const accuracy = Number(locationMessage?.accuracyInMeters ?? liveLocationMessage?.accuracyInMeters ?? 15);
            const speed = Number(locationMessage?.speedInMps ?? liveLocationMessage?.speedInMps ?? 0);
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

            locationPayload = {
              type: 'location',
              latitude: lat,
              longitude: lng,
              name: locName,
              address: locAddress,
              isLive,
              accuracy,
              speed,
              mapsUrl,
              sharedAt: new Date().toISOString()
            };

            inboundMediaUrl = JSON.stringify(locationPayload);
            messageText = `📍 ${isLive ? '🔴 Live Location Shared' : '📍 Location Shared'}: ${locName}${locAddress ? ` - ${locAddress}` : ''} (${lat.toFixed(6)}, ${lng.toFixed(6)})\n🗺️ Map: ${mapsUrl}`;
            queryForAi = `Customer shared location with coordinates ${lat}, ${lng}${locAddress ? ` at ${locAddress}` : ''}.`;
          }

          // If incoming message contains audio / voice note
          if (audioMessage) {
            isVoiceInbound = true;
            try {
              const { AudioService } = await import('./audio.service');
              const audioBuffer = await AudioService.downloadBaileysAudio(audioMessage);
              if (audioBuffer && audioBuffer.length > 0) {
                // Save inbound audio file for dashboard playback
                const inFileName = `inbound_voice_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.ogg`;
                const inFilePath = path.join(ENV.UPLOAD_DIR, inFileName);
                if (!fs.existsSync(ENV.UPLOAD_DIR)) {
                  fs.mkdirSync(ENV.UPLOAD_DIR, { recursive: true });
                }
                fs.writeFileSync(inFilePath, audioBuffer);
                inboundMediaUrl = `/uploads/${inFileName}`;

                // Transcribe using Groq Whisper (whisper-large-v3-turbo)
                const transcript = await AudioService.transcribeGroqWhisper(
                  audioBuffer,
                  audioMessage.mimetype || 'audio/ogg'
                );

                if (transcript) {
                  messageText = messageText
                    ? `${messageText}\n\n[User sent a voice message. Transcript: "${transcript}"]`
                    : `[User sent a voice message. Transcript: "${transcript}"]`;
                  queryForAi = transcript;
                } else {
                  messageText = `🎙️ [User sent a voice message: 0:0${audioMessage.seconds || 5}s]`;
                  queryForAi = 'Hello';
                }
              }
            } catch (audioErr: any) {
              console.error('Groq Whisper Processing Error:', audioErr);
            }
          }

          if (!messageText) continue;

          console.log(`📩 [WhatsApp ${sessionId}] ${isFromMe ? 'Outbound (from linked device)' : 'Inbound from ' + senderName} (${senderPhone}): "${messageText}"`);

          try {
            // Check if contact with senderPhone already exists
            let contact = await prisma.contact.findFirst({
              where: {
                businessId,
                phone: senderPhone
              }
            });

            if (!contact) {
              // Find by related formats (digits, +prefix, @lid)
              contact = await prisma.contact.findFirst({
                where: {
                  businessId,
                  OR: [
                    { phone: `+${cleanDigits}` },
                    { phone: `${cleanDigits}@lid` },
                    { phone: cleanDigits }
                  ]
                }
              });
            }

            if (contact) {
              try {
                contact = await prisma.contact.update({
                  where: { id: contact.id },
                  data: {
                    ...(!isFromMe && msg.pushName ? { name: msg.pushName } : {}),
                    phone: senderPhone,
                    lastSeenAt: new Date(),
                    tag: sessionId
                  }
                });
              } catch (updateErr) {
                // If unique constraint prevented updating phone, keep existing phone and update lastSeenAt
                contact = await prisma.contact.update({
                  where: { id: contact.id },
                  data: {
                    ...(!isFromMe && msg.pushName ? { name: msg.pushName } : {}),
                    lastSeenAt: new Date(),
                    tag: sessionId
                  }
                });
              }
            } else {
              contact = await prisma.contact.create({
                data: {
                  businessId,
                  name: isFromMe ? `Customer ${cleanDigits.slice(-4)}` : senderName,
                  phone: senderPhone,
                  tag: sessionId
                }
              });
            }

            // Save message in DB
            const savedMsg = await prisma.chatMessage.create({
              data: {
                contactId: contact.id,
                sender: isFromMe ? 'business' : 'customer',
                text: messageText,
                messageType: isVoiceInbound ? 'AUDIO' : 'TEXT',
                mediaUrl: inboundMediaUrl || null,
                status: 'DELIVERED'
              }
            });

            const contactPayload = {
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              avatarBg: 'bg-emerald-600',
              initials: (contact.name || 'WA').slice(0, 2).toUpperCase(),
              lastMessage: messageText,
              lastTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              unreadCount: isFromMe ? 0 : 1,
              isOnline: true,
              statusText: 'online'
            };

            const msgPayload = {
              id: savedMsg.id,
              sender: isFromMe ? 'business' : 'customer',
              text: messageText,
              messageType: isVoiceInbound ? 'audio' : (isLocationInbound ? 'location' : 'text'),
              location: locationPayload || undefined,
              mediaUrl: inboundMediaUrl || null,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: 'read'
            };

            // Broadcast message to frontend live chat
            const { EventsService } = await import('./events.service');
            EventsService.getInstance().broadcast('message:new', {
              sessionId,
              contactId: contact.id,
              contact: contactPayload,
              message: msgPayload
            }, { businessId, sessionId });

            // If message was sent by the linked device itself, don't trigger AI auto-response
            if (isFromMe) continue;

            // AI Auto-Responder via RAG Engine
            const business = await prisma.businessAccount.findUnique({ where: { id: businessId } }) ||
                             await prisma.businessAccount.findFirst();

            if (business && business.enableAi !== false) {
              // Direct WhatsApp Order / Buy Command Check (e.g. "BUY TECH-501", "BUY 2 TECH-501", "ORDER TECH-501")
              const buyMatch = queryForAi.trim().match(/^(?:buy|order)\s+(\d+)?\s*([a-z0-9\-_]+)$/i) ||
                               queryForAi.trim().match(/^(?:buy|order)\s+([a-z0-9\-_]+)(?:\s+(\d+))?$/i);

              if (buyMatch) {
                const partA = buyMatch[1];
                const partB = buyMatch[2];
                let requestedSku = '';
                let requestedQty = 1;

                if (/^\d+$/.test(partA)) {
                  requestedQty = Math.max(1, parseInt(partA, 10));
                  requestedSku = (partB || '').toUpperCase();
                } else if (partB && /^\d+$/.test(partB)) {
                  requestedQty = Math.max(1, parseInt(partB, 10));
                  requestedSku = (partA || '').toUpperCase();
                } else {
                  requestedSku = (partA || partB || '').toUpperCase();
                }

                if (requestedSku) {
                  const catItem = await prisma.catalogItem.findFirst({
                    where: { businessId: business.id, sku: { equals: requestedSku, mode: 'insensitive' } }
                  });

                  if (catItem) {
                    const { OrderService } = await import('./order.service');
                    const itemPrice = typeof catItem.price?.toNumber === 'function' ? catItem.price.toNumber() : Number(catItem.price);
                    const newOrder = await OrderService.createOrder({
                      businessId: business.id,
                      contactId: contact.id,
                      customerName: contact.name,
                      customerPhone: contact.phone,
                      items: [{
                        productId: catItem.id,
                        sku: catItem.sku,
                        name: catItem.name,
                        price: itemPrice,
                        quantity: requestedQty,
                        unit: catItem.unit,
                        imageUrl: catItem.imageUrl || undefined
                      }],
                      paymentStatus: 'COD'
                    });

                    const totalFormatted = `${business.currency || '₹'}${(itemPrice * requestedQty).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                    const orderReceipt = `🎉 *Order Successfully Placed!*

📋 *Order ID:* \`${newOrder.orderNumber}\`
───────────────
• *${requestedQty}x ${catItem.name}* (\`${catItem.sku}\`) - ${totalFormatted}
───────────────
💰 *Total Amount:* *${totalFormatted}*
💳 *Payment Method:* Cash on Delivery (COD)
📍 *Delivery To:* ${contact.name || contact.phone}

Thank you for your order with *${business.businessName}*! We are preparing your order for prompt dispatch. 🚀`;

                    const sentOrderReply = await socket.sendMessage(normalizedJid, { text: orderReceipt }).catch(() => null);
                    if (sentOrderReply?.key?.id) {
                      this.markMessageAsSent(sentOrderReply.key.id);
                    }
                    continue;
                  }
                }
              }

              const { ErpService } = await import('./erp.service');

              if (business.typingSimulation) {
                await socket.sendPresenceUpdate('composing', normalizedJid).catch(() => null);
              }

              // Query RAG Knowledge Base and ERP catalog
              console.log(`🤖 [RAG Engine] Generating AI response with pgvector retrieval for: "${queryForAi}"...`);
              const erpReply = await ErpService.queryErp({
                businessId: business.id,
                query: queryForAi
              });
              const finalAiReply = (erpReply.aiGeneratedReply || '')
                .replace(/\*\*(.*?)\*\*/g, '*$1*')
                .replace(/^---+$/gm, '')
                .trim();
              console.log(`🤖 [RAG Engine] AI Response synthesized:\n${finalAiReply}`);

              // Sanitize outbound text sent to mobile WhatsApp phone so raw [BUY_PRODUCT:...] JSON is never exposed to customers
              const outboundWhatsAppText = finalAiReply
                .replace(/\[BUY_PRODUCT:\s*\{[\s\S]*?\}\s*\]/gi, '')
                .trim();

              await new Promise((r) => setTimeout(r, 1200));

              // Resolve image buffer if media is a base64 data URI or local upload path
              let resolvedImageBuffer = erpReply.imageBuffer;
              if (!resolvedImageBuffer && erpReply.mediaUrl) {
                if (erpReply.mediaUrl.startsWith('data:image/')) {
                  const commaIdx = erpReply.mediaUrl.indexOf(',');
                  if (commaIdx !== -1) {
                    try {
                      resolvedImageBuffer = Buffer.from(erpReply.mediaUrl.slice(commaIdx + 1), 'base64');
                    } catch {}
                  }
                } else if (erpReply.mediaUrl.startsWith('/uploads/') || erpReply.mediaUrl.startsWith('uploads/')) {
                  const filename = path.basename(erpReply.mediaUrl);
                  const localPath = path.join(ENV.UPLOAD_DIR, filename);
                  if (fs.existsSync(localPath)) {
                    try {
                      resolvedImageBuffer = fs.readFileSync(localPath);
                    } catch {}
                  }
                }
              }

              // Send reply on WhatsApp using normalized JID
              let sentReply: any = null;
              const hasMedia = Boolean(erpReply.mediaUrl || resolvedImageBuffer);
              const isImage = erpReply.messageType === 'image' || (hasMedia && !erpReply.messageType);
              const isDoc = erpReply.messageType === 'document';

              let replyMediaUrl: string | null = erpReply.mediaUrl || null;
              let replyMessageType: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'TEXT' = 'TEXT';

              // RULE 1: If someone says create image or pdf or product card has visual -> Send image/pdf
              if (isImage && (resolvedImageBuffer || erpReply.mediaUrl)) {
                const imgPayload: any = resolvedImageBuffer
                  ? { image: resolvedImageBuffer, caption: outboundWhatsAppText }
                  : { image: { url: erpReply.mediaUrl }, caption: outboundWhatsAppText };

                sentReply = await socket.sendMessage(normalizedJid, imgPayload).catch(async (mediaErr: any) => {
                  console.warn(`⚠️ Baileys image dispatch failed (${mediaErr?.message}). Falling back to text...`);
                  return socket.sendMessage(normalizedJid, { text: outboundWhatsAppText }).catch(() => null);
                });
                replyMessageType = 'IMAGE';
                replyMediaUrl = erpReply.mediaUrl || null;
              } else if (isDoc && (erpReply.mediaUrl || erpReply.pdfBuffer)) {
                const catKey = (business?.category || 'document').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'document';
                const pdfName = erpReply.fileName || `${catKey}_pdf_${Date.now()}.pdf`;
                const docPayload: any = erpReply.pdfBuffer
                  ? {
                      document: erpReply.pdfBuffer,
                      mimetype: 'application/pdf',
                      fileName: pdfName,
                      caption: outboundWhatsAppText
                    }
                  : {
                      document: { url: erpReply.mediaUrl },
                      mimetype: 'application/pdf',
                      fileName: pdfName,
                      caption: outboundWhatsAppText
                    };

                sentReply = await socket.sendMessage(normalizedJid, docPayload).catch(async (docErr: any) => {
                  console.warn(`⚠️ Baileys document dispatch failed (${docErr?.message}). Falling back to text...`);
                  return socket.sendMessage(normalizedJid, { text: outboundWhatsAppText }).catch(() => null);
                });
                replyMessageType = 'DOCUMENT';
                replyMediaUrl = erpReply.mediaUrl || null;
              } else if (isVoiceInbound) {
                // RULE 2: ONLY if user sent an AUDIO voice message AND query is normal -> Respond with voice note + text attached
                try {
                  const { AudioService } = await import('./audio.service');
                  const speech = await AudioService.synthesizeSpeech(outboundWhatsAppText);

                  if (speech && speech.audioBuffer && speech.audioBuffer.length > 0) {
                    // Convert to WhatsApp-compliant OGG Opus if FFmpeg is available
                    const oggResult = AudioService.convertToOggOpus(speech.audioBuffer);

                    if (oggResult) {
                      // True WhatsApp PTT voice note with waveform, 100% supported on all iOS & Android devices
                      sentReply = await socket.sendMessage(normalizedJid, {
                        audio: oggResult.oggBuffer,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true
                      }).catch(() => null);
                      replyMediaUrl = oggResult.mediaUrl;
                    } else {
                      // When OGG Opus conversion is unavailable, send as standard audio message (ptt: false)
                      sentReply = await socket.sendMessage(normalizedJid, {
                        audio: speech.audioBuffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                      }).catch(async () => {
                        return socket.sendMessage(normalizedJid, {
                          audio: speech.audioBuffer,
                          mimetype: 'audio/mpeg',
                          ptt: false
                        }).catch(() => null);
                      });
                      replyMediaUrl = speech.mediaUrl;
                    }

                    // Send the accompanying formatted text alongside it for complete readability
                    await socket.sendMessage(normalizedJid, {
                      text: outboundWhatsAppText
                    }).catch(() => null);

                    replyMessageType = 'AUDIO';
                  } else {
                    sentReply = await socket.sendMessage(normalizedJid, { text: outboundWhatsAppText }).catch(() => null);
                    replyMessageType = 'TEXT';
                    replyMediaUrl = null;
                  }
                } catch (ttsErr: any) {
                  console.warn('Notice generating audio response, falling back to text:', ttsErr.message);
                  sentReply = await socket.sendMessage(normalizedJid, { text: outboundWhatsAppText }).catch(() => null);
                  replyMessageType = 'TEXT';
                  replyMediaUrl = null;
                }
              } else {
                // RULE 3: User sent a TEXT message AND normal query -> Respond with clean TEXT ONLY (NO audio attached)
                sentReply = await socket.sendMessage(normalizedJid, { text: outboundWhatsAppText }).catch(() => null);
                replyMessageType = 'TEXT';
                replyMediaUrl = null;
              }

              if (sentReply?.key?.id) {
                this.markMessageAsSent(sentReply.key.id);
              }
              await socket.sendPresenceUpdate('paused', normalizedJid).catch(() => null);

              // Save outgoing reply to DB
              const botMsg = await prisma.chatMessage.create({
                data: {
                  contactId: contact.id,
                  sender: 'business',
                  text: finalAiReply,
                  messageType: replyMessageType,
                  mediaUrl: replyMediaUrl,
                  isAiGenerated: true,
                  status: 'SENT'
                }
              });

              const botMsgPayload = {
                id: botMsg.id,
                sender: 'business',
                text: finalAiReply,
                messageType: replyMessageType.toLowerCase(),
                mediaUrl: replyMediaUrl,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isAiGenerated: true,
                status: 'read'
              };

              // Broadcast outgoing reply to frontend live chat
              EventsService.getInstance().broadcast('message:new', {
                sessionId,
                contactId: contact.id,
                contact: {
                  ...contactPayload,
                  lastMessage: finalAiReply,
                  unreadCount: 0
                },
                message: botMsgPayload
              }, { businessId, sessionId });
            }
          } catch (err: any) {
            console.error('Error handling inbound WhatsApp message:', err);
          }
        }
      });

      return { sessionId, status: SessionStatus.CONNECTING };
    } catch (err: any) {
      console.error(`Error initializing Baileys for session ${sessionId}:`, err);
      this.qrCache.delete(sessionId);
      this.emit(`status:${sessionId}`, { status: SessionStatus.DISCONNECTED, error: err.message });
      return { sessionId, status: SessionStatus.DISCONNECTED };
    }
  }

  public async refreshSessionQr(sessionId: string): Promise<void> {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Terminate existing socket
    const existingSocket = this.activeSockets.get(sessionId);
    if (existingSocket) {
      this.activeSockets.delete(sessionId);
      try {
        existingSocket.end(undefined);
      } catch (e) {}
    }
    this.qrCache.delete(sessionId);

    // Initialize fresh session socket
    await this.initSession({
      sessionId: session.id,
      sessionName: session.name,
      businessId: session.businessId,
      isPrimary: session.isPrimary
    });
  }

  public async deleteSession(sessionId: string, deleteMessages = true): Promise<void> {
    const socket = this.activeSockets.get(sessionId);
    if (socket) {
      this.activeSockets.delete(sessionId);
      try {
        await socket.logout();
      } catch (e) {}
      try {
        socket.end(undefined);
      } catch (e) {}
    }

    this.qrCache.delete(sessionId);

    // Remove credentials directory
    const sessionPath = path.join(ENV.SESSION_AUTH_DIR, sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    const sessionObj = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId }
    });
    const businessId = sessionObj?.businessId || (await prisma.businessAccount.findFirst())?.id;

    await prisma.whatsAppSession.delete({
      where: { id: sessionId }
    }).catch(() => null);

    // Note: Never wipe contacts or chat message history when a session is deleted or disconnected.
    // Customer records and conversation history belong to the business account and must persist across device re-pairings.
    console.log(`ℹ️ Session "${sessionId}" removed. All business contacts and chat history remain safely preserved.`);

    this.emit(`status:${sessionId}`, { status: SessionStatus.DISCONNECTED, reason: 'DELETED' });
    try {
      const { EventsService } = await import('./events.service');
      EventsService.getInstance().broadcast('session:status', {
        sessionId,
        status: SessionStatus.DISCONNECTED,
        reason: 'DELETED'
      }, { businessId });
    } catch (e) {}
  }

  public async disconnectSession(sessionId: string): Promise<void> {
    return this.deleteSession(sessionId, true);
  }

  public async disconnectOnlySession(sessionId: string): Promise<void> {
    const socket = this.activeSockets.get(sessionId);
    if (socket) {
      this.activeSockets.delete(sessionId);
      try {
        socket.end(undefined);
      } catch (e) {}
    }

    this.qrCache.delete(sessionId);

    const sessionObj = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
    const businessId = sessionObj?.businessId;

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.DISCONNECTED,
        qrCode: null
      }
    }).catch(() => null);

    this.emit(`status:${sessionId}`, { status: SessionStatus.DISCONNECTED, reason: 'DISCONNECTED' });
    try {
      const { EventsService } = await import('./events.service');
      EventsService.getInstance().broadcast('session:status', {
        sessionId,
        status: SessionStatus.DISCONNECTED,
        reason: 'DISCONNECTED'
      }, { businessId });
    } catch (e) {}
  }

  public async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    let socket = this.activeSockets.get(sessionId);
    if (!socket) {
      const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
      const business = await prisma.businessAccount.findFirst();
      await this.initSession({
        sessionId,
        sessionName: session?.name || 'WhatsApp Device',
        businessId: session?.businessId || business?.id || 'demo_biz',
        isPrimary: true
      });
      // Wait for socket to initialize
      for (let i = 0; i < 15; i++) {
        socket = this.activeSockets.get(sessionId);
        if (socket) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!socket) {
      throw new Error(`Session ${sessionId} is not active. Connect session first.`);
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      throw new Error('Valid phone number with country code is required.');
    }
    console.log(`Requesting WhatsApp pairing code for phone: +${cleanPhone} on session: ${sessionId}...`);
    const code = await socket.requestPairingCode(cleanPhone);
    console.log(`✅ WhatsApp Pairing Code generated: ${code}`);
    return code;
  }
}
