import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import { getDb } from '../lib/db';
import { TeamMember } from '../entities/TeamMember';

const router = Router();

// GET /api/organization/me — returns current user's role context
router.get('/me', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const clerkUser = await clerkClient.users.getUser(userId);
    const meta = clerkUser.publicMetadata as {
      role?: string;
      organizationName?: string;
      onboardingComplete?: boolean;
    };

    // If they've completed onboarding via the page, return that
    if (meta.onboardingComplete) {
      return res.json({
        success: true,
        data: {
          role: meta.role || null,
          organizationName: meta.organizationName || null,
          onboardingComplete: true,
        },
      });
    }

    const ds = await getDb();
    const repo = ds.getRepository(TeamMember);

    // Check if they're an active member of someone else's org (invited before onboarding)
    const activeMemberRow = await repo.findOneBy({ memberId: userId, status: 'active' });

    if (activeMemberRow) {
      let organizationName: string | null = null;
      try {
        const owner = await clerkClient.users.getUser(activeMemberRow.ownerId);
        const ownerMeta = owner.publicMetadata as { organizationName?: string };
        organizationName = ownerMeta.organizationName || null;
      } catch { /* ok */ }
      return res.json({
        success: true,
        data: { role: 'member', organizationName, onboardingComplete: true },
      });
    }

    // Check if they were invited while they didn't have an account yet (pending row by email)
    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (email) {
      const pendingRow = await repo.findOneBy({ email, status: 'pending' });
      if (pendingRow) {
        // Auto-activate: link their Clerk userId to the pending invite
        await repo.update({ id: pendingRow.id }, { memberId: userId, status: 'active' });
        let organizationName: string | null = null;
        try {
          const owner = await clerkClient.users.getUser(pendingRow.ownerId);
          const ownerMeta = owner.publicMetadata as { organizationName?: string };
          organizationName = ownerMeta.organizationName || null;
        } catch { /* ok */ }
        return res.json({
          success: true,
          data: { role: 'member', organizationName, onboardingComplete: true },
        });
      }
    }

    // Not onboarded yet
    return res.json({
      success: true,
      data: { role: null, organizationName: null, onboardingComplete: false },
    });
  } catch (error) {
    console.error('Error fetching org context:', error);
    res.status(500).json({ error: 'Failed to fetch organization context' });
  }
});

// POST /api/organization/setup — called from onboarding page to complete setup
router.post('/setup', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { type, organizationName } = req.body as {
      type: 'owner' | 'member';
      organizationName?: string;
    };

    if (!type || !['owner', 'member'].includes(type)) {
      return res.status(400).json({ error: 'type must be "owner" or "member"' });
    }

    if (type === 'owner') {
      const name = (organizationName || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Organization name is required for owners' });
      }

      await clerkClient.users.updateUser(userId, {
        publicMetadata: {
          role: 'owner',
          organizationName: name,
          onboardingComplete: true,
        },
      });

      return res.json({
        success: true,
        data: { role: 'owner', organizationName: name },
      });
    }

    // Member — just mark onboarding complete
    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        role: 'member',
        organizationName: null,
        onboardingComplete: true,
      },
    });

    return res.json({
      success: true,
      data: { role: 'member', organizationName: null },
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export default router;
