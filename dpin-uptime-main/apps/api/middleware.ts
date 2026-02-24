import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_PUBLIC_KEY } from "./config";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    if (process.env.DISABLE_AUTH === 'true') {
        req.userId = process.env.DEMO_USER_ID || 'demo-user';
        return next();
    }
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, JWT_PUBLIC_KEY);
        if (!decoded || typeof decoded === "string" || !decoded.sub) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.userId = decoded.sub as string;
        next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}