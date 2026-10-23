import { Router } from 'express';
import { LocationSessionService } from '../services/location-session.service';

const router = Router();

router.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const location = LocationSessionService.getInstance().getLocation(sessionId);
  if (!location) {
    return res.status(404).json({ success: false, error: 'Location session not found or expired' });
  }
  return res.json({ success: true, location });
});

router.post('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { latitude, longitude, accuracy, heading, speed, address, senderName, senderPhone, orderId, isSharing } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: 'latitude and longitude are required' });
  }
  const location = LocationSessionService.getInstance().updateLocation({
    sessionId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy: accuracy !== undefined ? Number(accuracy) : undefined,
    heading: heading !== undefined ? Number(heading) : undefined,
    speed: speed !== undefined ? Number(speed) : undefined,
    address,
    senderName,
    senderPhone,
    orderId,
    isSharing
  });
  return res.json({ success: true, location });
});

router.post('/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const location = LocationSessionService.getInstance().stopSharing(sessionId);
  return res.json({ success: true, location });
});

export default router;
