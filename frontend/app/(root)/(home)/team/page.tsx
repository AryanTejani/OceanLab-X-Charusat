'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@clerk/nextjs';
import Loader from '@/components/Loader';
import { apiFetch } from '@/lib/api';
import { ITeamMember } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import InviteMemberModal from '@/components/InviteMemberModal';

interface OrgContext {
  role: 'owner' | 'member' | null;
  organizationName: string | null;
  onboardingComplete: boolean;
}

const TeamPage = () => {
  const [members, setMembers] = useState<ITeamMember[]>([]);
  const [orgCtx, setOrgCtx] = useState<OrgContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const { getToken } = useAuth();
  const { toast } = useToast();

  const isOwner = orgCtx?.role === 'owner';

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const [orgRes, membersRes] = await Promise.all([
          apiFetch('/api/organization/me', token),
          apiFetch('/api/team', token),
        ]);

        if (orgRes.ok) {
          const json = await orgRes.json();
          setOrgCtx(json.data);
        }

        if (membersRes.ok) {
          const json = await membersRes.json();
          setMembers(json.data);
        }
      } catch (err) {
        console.error('Failed to load team page:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [getToken]);

  const handleRemove = async (memberId: string) => {
    const token = await getToken();
    const res = await apiFetch(`/api/team/${memberId}`, token, { method: 'DELETE' });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast({ title: 'Member removed' });
    } else {
      const json = await res.json().catch(() => ({}));
      toast({ title: json.error || 'Failed to remove member', variant: 'destructive' });
    }
  };

  const handleInviteSuccess = (newMember: ITeamMember) => {
    setMembers((prev) => [newMember, ...prev]);
    setShowInviteModal(false);
    toast({ title: 'Invitation sent' });
  };

  if (loading) return <Loader />;

  return (
    <section className="flex size-full flex-col gap-8 text-white">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Members</h1>
          {orgCtx?.organizationName && (
            <p className="mt-1 text-gray-400">
              {isOwner ? 'Organization: ' : 'You are a member of: '}
              <span className="font-medium text-white">{orgCtx.organizationName}</span>
            </p>
          )}
          {!isOwner && orgCtx?.role === 'member' && (
            <p className="mt-1 text-sm text-gray-500">
              Members can view the team but cannot invite others.
            </p>
          )}
        </div>

        {isOwner && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="rounded-md bg-blue-1 px-4 py-2 text-sm font-medium hover:bg-blue-600 transition"
          >
            + Invite Member
          </button>
        )}
      </div>

      {/* Table */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-16 rounded-full bg-dark-3 flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5E6680" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">No team members yet</h2>
          {isOwner ? (
            <p className="text-gray-400 max-w-md">
              Invite your first team member to get started.
            </p>
          ) : (
            <p className="text-gray-400 max-w-md">
              You haven&apos;t been added to a team yet. Ask your organization owner to invite you.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-dark-3 text-gray-400 text-sm">
                <th className="pb-3 pl-2">Member</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Joined</th>
                <th className="pb-3">Status</th>
                {isOwner && <th className="pb-3">Action</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-dark-3">
                  <td className="py-4 pl-2">
                    <div className="flex items-center gap-3">
                      {member.imageUrl ? (
                        <Image
                          src={member.imageUrl}
                          alt={member.name || ''}
                          width={36}
                          height={36}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="size-9 rounded-full bg-dark-3 flex items-center justify-center text-sm text-gray-400">
                          {(member.name || member.email)[0].toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{member.name || 'Pending'}</span>
                    </div>
                  </td>
                  <td className="py-4 text-gray-300">{member.email}</td>
                  <td className="py-4 text-gray-300">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        member.status === 'active'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-yellow-900/30 text-yellow-400'
                      }`}
                    >
                      {member.status === 'active' ? 'Active' : 'Pending'}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="py-4">
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="rounded-md bg-red-900/30 px-3 py-1 text-xs text-red-400 hover:bg-red-900/50 transition"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInviteModal && isOwner && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </section>
  );
};

export default TeamPage;
