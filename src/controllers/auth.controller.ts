import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types';

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        domain,
        password,
        businessName,
        category,
        categoryLabel,
        ownerName,
        phone,
        email,
        address,
        currency,
        workingHours,
        greetingMessage,
        aiPersonaPrompt
      } = req.body;

      if (!domain) {
        res.status(400).json({ success: false, error: 'Company domain name is required (e.g. apollo-pharma.com)' });
        return;
      }

      if (!password) {
        res.status(400).json({ success: false, error: 'Password is required (minimum 6 characters)' });
        return;
      }

      if (!businessName) {
        res.status(400).json({ success: false, error: 'Business name is required' });
        return;
      }

      const result = await AuthService.register({
        domain,
        password,
        businessName,
        category,
        categoryLabel,
        ownerName,
        phone,
        email,
        address,
        currency,
        workingHours,
        greetingMessage,
        aiPersonaPrompt
      });

      res.status(201).json({
        success: true,
        message: 'Business account created successfully',
        ...result
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Registration failed' });
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { domain, password } = req.body;

      if (!domain || !password) {
        res.status(400).json({ success: false, error: 'Company domain name and password are required' });
        return;
      }

      const result = await AuthService.login({ domain, password });

      res.json({
        success: true,
        message: 'Logged in successfully',
        ...result
      });
    } catch (err: any) {
      res.status(401).json({ success: false, error: err.message || 'Authentication failed' });
    }
  }

  public static async updatePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { domain, currentPassword, newPassword } = req.body;
      const businessId = req.business?.id;

      if (!newPassword) {
        res.status(400).json({ success: false, error: 'New password is required' });
        return;
      }

      await AuthService.updatePassword({
        domain: domain || (req.business as any)?.domain,
        businessId,
        currentPassword,
        newPassword
      });

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to update password' });
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = (req.headers['x-api-key'] || req.query.apiKey) as string;
      const domain = req.query.domain as string;
      const identifier = apiKey || domain || req.business?.id;

      if (!identifier) {
        res.status(400).json({ success: false, error: 'No authentication token or domain provided' });
        return;
      }

      const result = await AuthService.getMe(identifier);

      if (!result.account) {
        res.status(404).json({ success: false, error: 'Account not found' });
        return;
      }

      res.json({ success: true, ...result });
    } catch (err: any) {
      next(err);
    }
  }
}
