import { Router, Request, Response } from 'express';
import { GuestProfileModel } from '../models/GuestProfile';

const router = Router();

// ============================================================
// GET /api/guest/:guestId
// ============================================================
// Returns the stored username for a guest ID, if one exists.
// Used by the client on page load to recognize returning users.

router.get('/guest/:guestId', async (req: Request, res: Response) => {
  try {
    const { guestId } = req.params;

    if (!guestId || typeof guestId !== 'string' || guestId.length === 0) {
      res.status(400).json({ error: 'Invalid guestId' });
      return;
    }

    const profile = await GuestProfileModel.findOne({ guestId }).lean();

    if (!profile) {
      res.status(404).json({ error: 'Guest not found' });
      return;
    }

    res.json({ guestId: profile.guestId, username: profile.username });
  } catch (error) {
    console.error('Error fetching guest profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
