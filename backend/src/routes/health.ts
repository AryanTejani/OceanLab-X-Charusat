import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const ds = await getDb();
    await ds.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', db: 'disconnected', message: String(error) });
  }
});

export default router;
