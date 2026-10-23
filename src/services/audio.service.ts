import path from 'path';
import fs from 'fs';
import { ENV } from '../config/env';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { spawnSync } from 'child_process';

export interface AudioSynthesisResult {
  audioBuffer: Buffer;
  mediaUrl: string;
  durationSeconds: number;
}

export class AudioService {
  /**
   * Transcribe an incoming audio message buffer using Groq Whisper API (whisper-large-v3-turbo)
   */
  public static async transcribeGroqWhisper(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
    const apiKey = ENV.GROQ_API_KEY || (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      console.warn('⚠️ [AudioService] No GROQ_API_KEY configured for Whisper transcription.');
      return '';
    }

    try {
      console.log(`🎙️ [Groq Whisper] Transcribing ${audioBuffer.length} bytes of audio (${mimeType})...`);
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData as any
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [Groq Whisper] Error ${response.status}:`, errText);
        return '';
      }

      const data: any = await response.json();
      if (data && data.text) {
        const cleanText = data.text.trim();
        console.log(`✅ [Groq Whisper] Transcription succeeded: "${cleanText}"`);
        return cleanText;
      }
    } catch (err: any) {
      console.error('❌ [Groq Whisper] Transcription failed:', err.message || err);
    }

    return '';
  }

  /**
   * Cleans WhatsApp text into natural, fluent speakable words for speech synthesis
   */
  public static cleanTextForSpeech(text: string): string {
    if (!text) return '';

    return text
      // Remove visual markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      // Remove special tags and brackets
      .replace(/\[IMAGE_URL:\s*https?:\/\/[^\]\s]+\]/gi, '')
      .replace(/\[Source\s*\d+:.*?\]/gi, '')
      .replace(/\[User sent.*?\]/gi, '')
      .replace(/🎙️\s*\[.*?\]\s*/g, '')
      // Remove URLs
      .replace(/https?:\/\/\S+/gi, '')
      // Remove emojis and special unicode symbols
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      // Remove bullet markers and divider lines
      .replace(/^[•\-\*]\s+/gm, '')
      .replace(/^---+$/gm, '')
      // Expand common abbreviations for natural speech
      .replace(/\bqty\b/gi, 'quantity')
      .replace(/\bpcs\b/gi, 'pieces')
      .replace(/\bhrs\b/gi, 'hours')
      .replace(/\bmins\b/gi, 'minutes')
      .replace(/\bapprox\b/gi, 'approximately')
      .replace(/\bRs\.?\s*(\d+)/gi, '$1 rupees')
      .replace(/₹\s*(\d+)/g, '$1 rupees')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Synthesizes text into high-quality natural speech audio using Google TTS
   * and optionally re-hosts to Cloudinary CDN
   */
  public static async synthesizeSpeech(text: string): Promise<AudioSynthesisResult> {
    const speakableText = this.cleanTextForSpeech(text);
    const fallbackText = speakableText.slice(0, 800) || 'Thank you for contacting us! How can I help you today?';

    // Ensure uploads directory exists
    if (!fs.existsSync(ENV.UPLOAD_DIR)) {
      fs.mkdirSync(ENV.UPLOAD_DIR, { recursive: true });
    }

    // Split text into natural sentence/clause chunks under 180 characters for TTS engine
    const sentenceChunks: string[] = [];
    const rawSentences = fallbackText.split(/(?<=[.!?,\n])\s+/);
    let currentChunk = '';

    for (const s of rawSentences) {
      if ((currentChunk + ' ' + s).trim().length <= 180) {
        currentChunk = (currentChunk + ' ' + s).trim();
      } else {
        if (currentChunk) sentenceChunks.push(currentChunk);
        // If single sentence itself is > 180 chars, split by words
        if (s.length > 180) {
          const words = s.split(' ');
          let sub = '';
          for (const w of words) {
            if ((sub + ' ' + w).trim().length <= 180) {
              sub = (sub + ' ' + w).trim();
            } else {
              if (sub) sentenceChunks.push(sub);
              sub = w;
            }
          }
          if (sub) currentChunk = sub;
        } else {
          currentChunk = s;
        }
      }
    }
    if (currentChunk) sentenceChunks.push(currentChunk);

    const audioBuffers: Buffer[] = [];

    for (const chunk of sentenceChunks) {
      if (!chunk.trim()) continue;
      try {
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk.trim())}&tl=en&client=tw-ob`;
        const res = await fetch(ttsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          audioBuffers.push(Buffer.from(arrayBuf));
        }
      } catch (err: any) {
        console.warn('Notice fetching TTS chunk:', err.message);
      }
    }

    const unifiedAudioBuffer = Buffer.concat(audioBuffers);
    const fileName = `voice_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.mp3`;
    const localFilePath = path.join(ENV.UPLOAD_DIR, fileName);

    fs.writeFileSync(localFilePath, unifiedAudioBuffer);

    // Approximate audio duration (average 2.8 words per second)
    const wordCount = speakableText.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(3, Math.round(wordCount / 2.8));

    // Upload to Cloudinary if configured
    let mediaUrl = `/uploads/${fileName}`;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    if (cloudName) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(unifiedAudioBuffer)], { type: 'audio/mpeg' });
        formData.append('file', blob, fileName);
        formData.append('resource_type', 'video'); // Cloudinary handles audio files under video resource type
        if (uploadPreset) formData.append('upload_preset', uploadPreset);

        const headers: Record<string, string> = {};
        if (apiKey && apiSecret) {
          const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
          headers['Authorization'] = `Basic ${auth}`;
        }

        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
          method: 'POST',
          headers,
          body: formData as any
        });

        if (cloudRes.ok) {
          const cloudData: any = await cloudRes.json();
          if (cloudData.secure_url) {
            mediaUrl = cloudData.secure_url;
            console.log(`☁️ [Cloudinary] Voice note hosted to CDN: ${mediaUrl}`);
          }
        }
      } catch (err: any) {
        console.warn('Notice uploading voice to Cloudinary (using local upload):', err.message);
      }
    }

    return {
      audioBuffer: unifiedAudioBuffer,
      mediaUrl,
      durationSeconds
    };
  }

  /**
   * Helper to download audio content from Baileys audio message stream
   */
  public static async downloadBaileysAudio(audioMessage: any): Promise<Buffer> {
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  }

  /**
   * Detect FFmpeg binary location on the host system
   */
  public static getFfmpegPath(): string | null {
    try {
      const res = spawnSync('ffmpeg', ['-version'], { timeout: 3000 });
      if (res.status === 0) return 'ffmpeg';
    } catch {}

    const commonPaths = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'ffmpeg.exe')
    ];

    for (const p of commonPaths) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return null;
  }

  /**
   * Converts MP3 speech buffer into WhatsApp-compliant OGG Opus format
   * (audio/ogg; codecs=opus) so that mobile WhatsApp can decode and play PTT voice notes natively.
   */
  public static convertToOggOpus(mp3Buffer: Buffer): { oggBuffer: Buffer; mediaUrl: string } | null {
    const ffmpegPath = this.getFfmpegPath();
    if (!ffmpegPath) {
      console.log('ℹ️ [AudioService] FFmpeg not found. Voice will be dispatched using universal MP4/MP3 audio container.');
      return null;
    }

    const uniqueId = `${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const tmpInput = path.join(ENV.UPLOAD_DIR, `temp_${uniqueId}.mp3`);
    const oggFileName = `voice_${uniqueId}.ogg`;
    const tmpOutput = path.join(ENV.UPLOAD_DIR, oggFileName);

    try {
      if (!fs.existsSync(ENV.UPLOAD_DIR)) {
        fs.mkdirSync(ENV.UPLOAD_DIR, { recursive: true });
      }
      fs.writeFileSync(tmpInput, mp3Buffer);

      const res = spawnSync(ffmpegPath, [
        '-y',
        '-i', tmpInput,
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-vbr', 'on',
        '-compression_level', '10',
        '-f', 'ogg',
        tmpOutput
      ], { timeout: 15000 });

      try { fs.unlinkSync(tmpInput); } catch {}

      if (res.status === 0 && fs.existsSync(tmpOutput)) {
        const oggBuffer = fs.readFileSync(tmpOutput);
        console.log(`✅ [AudioService] Converted ${mp3Buffer.length}b MP3 to ${oggBuffer.length}b WhatsApp OGG Opus (${oggFileName}).`);
        return {
          oggBuffer,
          mediaUrl: `/uploads/${oggFileName}`
        };
      } else {
        console.warn('⚠️ [AudioService] FFmpeg conversion notice:', res.stderr?.toString()?.slice(0, 150));
        try { if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch {}
      }
    } catch (err: any) {
      console.warn('⚠️ [AudioService] FFmpeg execution error:', err.message);
    }
    return null;
  }
}
