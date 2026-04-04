import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import { getDb } from '../lib/db';
import { MeetingInvitation } from '../entities/MeetingInvitation';

const router = Router();

// GET /api/notifications/meeting-invites — returns pending meeting invitations for the auth user (polling endpoint)
router.get('/meeting-invites', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ds = await getDb();
    const invitations = await ds
      .getRepository(MeetingInvitation)
      .createQueryBuilder('inv')
      .where('inv.inviteeId = :userId', { userId })
      .andWhere('inv.status = :status', { status: 'pending' })
      .orderBy('inv.createdAt', 'DESC')
      .getMany();

    // Enrich with inviter names
    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        let inviterName = 'Someone';
        try {
          const inviter = await clerkClient.users.getUser(inv.inviterId);
          const firstName = inviter.firstName || '';
          const lastName = inviter.lastName || '';
          inviterName = `${firstName} ${lastName}`.trim() || inviter.emailAddresses?.[0]?.emailAddress || 'Someone';
        } catch {
          // fallback to 'Someone'
        }
        return {
          id: inv.id,
          meetingId: inv.meetingId,
          meetingTitle: inv.meetingTitle,
          inviterName,
          createdAt: inv.createdAt,
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Error fetching meeting invitations:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/meeting-invites/:id/dismiss — mark a notification as dismissed
router.patch('/meeting-invites/:id/dismiss', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const ds = await getDb();
    const repo = ds.getRepository(MeetingInvitation);

    const invitation = await repo.findOneBy({ id, inviteeId: userId });
    if (!invitation) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await repo.update({ id, inviteeId: userId }, { status: 'dismissed' });

    res.json({ success: true });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

export default router;
