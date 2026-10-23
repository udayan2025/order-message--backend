import crypto from 'crypto';

export function generateHmacSignature(payload: string | object, secret: string): string {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(content);
  return `sha256=${hmac.digest('hex')}`;
}

export function verifyHmacSignature(payload: string | object, signature: string, secret: string): boolean {
  const expected = generateHmacSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
