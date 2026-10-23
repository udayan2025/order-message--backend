export interface LocationData {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  address?: string;
  senderName?: string;
  senderPhone?: string;
  orderId?: string;
  isSharing: boolean;
  lastUpdated: number;
}

export class LocationSessionService {
  private static instance: LocationSessionService;
  private sessions: Map<string, LocationData> = new Map();

  public static getInstance(): LocationSessionService {
    if (!LocationSessionService.instance) {
      LocationSessionService.instance = new LocationSessionService();
    }
    return LocationSessionService.instance;
  }

  public updateLocation(data: Partial<LocationData> & { sessionId: string; latitude: number; longitude: number }): LocationData {
    const existing = this.sessions.get(data.sessionId);
    const updated: LocationData = {
      sessionId: data.sessionId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? existing?.accuracy ?? 10,
      heading: data.heading ?? existing?.heading ?? null,
      speed: data.speed ?? existing?.speed ?? null,
      address: data.address ?? existing?.address ?? '',
      senderName: data.senderName ?? existing?.senderName ?? '',
      senderPhone: data.senderPhone ?? existing?.senderPhone ?? '',
      orderId: data.orderId ?? existing?.orderId,
      isSharing: data.isSharing !== undefined ? data.isSharing : true,
      lastUpdated: Date.now()
    };
    this.sessions.set(data.sessionId, updated);
    return updated;
  }

  public getLocation(sessionId: string): LocationData | null {
    return this.sessions.get(sessionId) || null;
  }

  public stopSharing(sessionId: string): LocationData | null {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.isSharing = false;
      existing.lastUpdated = Date.now();
      this.sessions.set(sessionId, existing);
      return existing;
    }
    return null;
  }
}
