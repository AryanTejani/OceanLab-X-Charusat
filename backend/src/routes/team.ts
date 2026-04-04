import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import { getDb } from '../lib/db';
import { TeamMember } from '../entities/TeamMember';

const router = Router();

// GET /api/team — list all team members for the org.
// Works for both owners (ownerId = userId) and members (memberId = userId).
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ds = await getDb();
    const repo = ds.getRepository(TeamMember);

    // Determine which ownerId's org to return
    let orgOwnerId: string = userId;

    const asMember = await repo.findOneBy({ memberId: userId, status: 'active' });
    if (asMember) {
      // Caller is a member of another org — show that org's members
      orgOwnerId = asMember.ownerId;
    }

    const members = await repo
      .createQueryBuilder('tm')
      .where('tm.ownerId = :orgOwnerId', { orgOwnerId })
      .orderBy('tm.joinedAt', 'DESC')
      .getMany();

    const enriched = await Promise.all(
      members.map(async (member) => {
        if (member.status === 'active' && member.memberId) {
          try {
            const clerkUser = await clerkClient.users.getUser(member.memberId);
            const firstName = clerkUser.firstName || '';
            const lastName = clerkUser.lastName || '';
            const name = `${firstName} ${lastName}`.trim() || member.email;
            return {
              id: member.id,
              ownerId: member.ownerId,
              memberId: member.memberId,
              email: clerkUser.emailAddresses?.[0]?.emailAddress || member.email,
              role: member.role,
              status: member.status as 'pending' | 'active',
              clerkInvitationId: member.clerkInvitationId,
              joinedAt: member.joinedAt,
              name,
              imageUrl: clerkUser.imageUrl || null,
            };
          } catch (err) {
            console.error(`Failed to fetch Clerk user for memberId ${member.memberId}:`, err);
            return {
              id: member.id,
              ownerId: member.ownerId,
              memberId: member.memberId,
              email: member.email,
              role: member.role,
              status: member.status as 'pending' | 'active',
              clerkInvitationId: member.clerkInvitationId,
              joinedAt: member.joinedAt,
              name: member.email,
              imageUrl: null,
            };
          }
        }

        // Pending member — no Clerk profile yet
        return {
          id: member.id,
          ownerId: member.ownerId,
          memberId: member.memberId,
          email: member.email,
          role: member.role,
          status: member.status as 'pending' | 'active',
          clerkInvitationId: member.clerkInvitationId,
          joinedAt: member.joinedAt,
          name: 'Pending',
          imageUrl: null,
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/team/invite — owner-only. Sends a Clerk invitation and creates a pending TeamMember row.
router.post('/invite', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { email } = req.body as { email: string };

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(TeamMember);

    // Role enforcement: members cannot invite others — only org owners can
    const callerAsMember = await repo.findOneBy({ memberId: userId, status: 'active' });
    if (callerAsMember) {
      return res.status(403).json({
        error: 'Only organization owners can invite members. You are a member of another organization.',
      });
    }

    // Prevent self-invite
    const owner = await clerkClient.users.getUser(userId);
    const ownerEmail = owner.emailAddresses?.[0]?.emailAddress;
    if (ownerEmail && ownerEmail.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot invite yourself' });
    }

    // Exclusive membership: check if the invitee is already in any org
    let inviteeClerkId: string | null = null;
    try {
      const existingUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
      if (existingUsers.data && existingUsers.data.length > 0) {
        inviteeClerkId = existingUsers.data[0].id;
      }
    } catch (lookupErr) {
      console.warn('Could not look up Clerk user for exclusive membership check:', lookupErr);
    }

    if (inviteeClerkId) {
      const alreadyMember = await repo.findOneBy({ memberId: inviteeClerkId, status: 'active' });
      if (alreadyMember) {
        return res.status(409).json({
          error: 'This user is already a member of another organization.',
        });
      }
    }

    // Prevent duplicate invitations to this org
    const existing = await repo.findOneBy({ ownerId: userId, email });
    if (existing) {
      return res.status(409).json({ error: 'Member already invited to your organization' });
    }

    let clerkInvitationId: string | null = null;
    let status: 'pending' | 'active' = 'pending';
    let memberId: string | null = null;

    if (inviteeClerkId) {
      // User already exists in Clerk — add as active directly (no invite email needed)
      memberId = inviteeClerkId;
      status = 'active';
    } else {
      try {
        const invitation = await clerkClient.invitations.createInvitation({
          emailAddress: email,
          redirectUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        });
        clerkInvitationId = invitation.id;
      } catch (clerkErr: unknown) {
        console.error('Clerk invitation failed:', clerkErr);
        return res.status(500).json({ error: 'Failed to send invitation email' });
      }
    }

    const member = repo.create({
      ownerId: userId,
      memberId,
      email,
      role: 'member',
      status,
      clerkInvitationId,
    });

    const saved = await repo.save(member);

    res.status(201).json({
      success: true,
      data: {
        id: saved.id,
        email: saved.email,
        status: saved.status,
        role: saved.role,
        joinedAt: saved.joinedAt,
      },
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ error: 'Failed to invite team member' });
  }
});

// DELETE /api/team/:memberId — owner-only. Removes a team member and revokes their pending Clerk invitation.
router.delete('/:memberId', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { memberId } = req.params;

    const ds = await getDb();
    const repo = ds.getRepository(TeamMember);

    // Role enforcement: only org owners can remove members
    const callerAsMember = await repo.findOneBy({ memberId: userId, status: 'active' });
    if (callerAsMember) {
      return res.status(403).json({
        error: 'Only organization owners can remove members.',
      });
    }

    const member = await repo.findOneBy({ id: memberId, ownerId: userId });
    if (!member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    if (member.status === 'pending' && member.clerkInvitationId) {
      try {
        await clerkClient.invitations.revokeInvitation(member.clerkInvitationId);
      } catch (revokeErr) {
        console.warn('Failed to revoke Clerk invitation (may already be revoked):', revokeErr);
      }
    }

    await repo.delete({ id: memberId, ownerId: userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
