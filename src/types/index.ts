import { Request } from 'express';
import { BusinessAccount } from '@prisma/client';

export type BusinessCategory =
  | 'medicine'
  | 'gym'
  | 'grocery'
  | 'electronics'
  | 'restaurant'
  | 'salon'
  | 'custom';

export type SessionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
export type MessageSender = 'customer' | 'business' | 'system';
export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'CATALOG_CARD';
export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface AuthenticatedRequest extends Request {
  business?: BusinessAccount;
}

export interface CreateSessionDTO {
  sessionId: string;
  sessionName: string;
  isPrimary?: boolean;
}

export interface SendMessageDTO {
  sessionId: string;
  to: string;
  content: string;
  messageType?: 'text' | 'image' | 'audio' | 'document' | 'catalog';
  mediaUrl?: string;
  antiBanPacing?: boolean;
  simulateTyping?: boolean;
}

export interface SendMediaDTO {
  sessionId: string;
  to: string;
  messageType: 'image' | 'audio' | 'document';
  mediaUrl: string;
  caption?: string;
}

export interface BulkCatalogDTO {
  items: Array<{
    sku: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    unit?: string;
    description?: string;
    isAvailable?: boolean;
  }>;
}

export interface ErpQueryDTO {
  query: string;
  sessionId?: string;
  contactPhone?: string;
}

export interface RagSearchDTO {
  query: string;
  limit?: number;
  threshold?: number;
}
