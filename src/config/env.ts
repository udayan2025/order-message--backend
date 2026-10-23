import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_SECRET_KEY: process.env.API_SECRET_KEY || 'msgapi_master_secret_key_889922',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/messageapi?schema=public',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').replace(/^["']|["']$/g, ''),
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  EMBEDDING_DIMENSION: parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS || process.env.EMBEDDING_DIMENSION || '768', 10),
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_LLM_MODEL: process.env.GROQ_LLM_MODEL || 'openai/gpt-oss-120b',
  SESSION_AUTH_DIR: path.resolve(process.cwd(), process.env.SESSION_AUTH_DIR || './whatsapp_auth_sessions'),
  UPLOAD_DIR: path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads'),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000'
};
