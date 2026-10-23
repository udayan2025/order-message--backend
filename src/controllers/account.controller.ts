import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { AccountService } from "../services/account.service";

export class AccountController {
  public static async listAccounts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const accounts = await AccountService.listAccounts();
      res.json({ success: true, accounts });
    } catch (err) {
      next(err);
    }
  }

  public static async getAccount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = req.params.id || req.business?.id;
      if (!id) {
        res.status(400).json({ success: false, error: "Account ID required" });
        return;
      }
      const account = await AccountService.getAccountById(id);
      if (!account) {
        res.status(404).json({ success: false, error: "Account not found" });
        return;
      }
      const stats = await AccountService.getAccountStats(id);
      res.json({ success: true, account: { ...account, stats } });
    } catch (err) {
      next(err);
    }
  }

  public static async createAccount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const {
        businessName,
        category,
        ownerName,
        phone,
        email,
        address,
        workingHours,
        greetingMessage,
        aiPersonaPrompt,
      } = req.body;
      if (!businessName) {
        res
          .status(400)
          .json({ success: false, error: "businessName is required" });
        return;
      }

      const account = await AccountService.createAccount({
        businessName,
        category,
        ownerName,
        phone,
        email,
        address,
        workingHours,
        greetingMessage,
        aiPersonaPrompt,
      });

      res.status(201).json({ success: true, account });
    } catch (err) {
      next(err);
    }
  }

  public static async updateAccount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = req.params.id || req.business?.id;
      if (!id) {
        res.status(400).json({ success: false, error: "Account ID required" });
        return;
      }
      const updated = await AccountService.updateAccount(id, req.body);
      res.json({ success: true, account: updated });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteAccount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = req.params.id || req.business?.id;
      if (!id) {
        res.status(400).json({ success: false, error: "Account ID required" });
        return;
      }
      await AccountService.deleteAccount(id);
      res.json({ success: true, message: "Account deleted" });
    } catch (err) {
      next(err);
    }
  }
}
