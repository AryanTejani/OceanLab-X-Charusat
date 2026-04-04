'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';
import { ITeamMember } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from './ui/use-toast';

interface TeamMemberPanelProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  currentParticipantIds: string[];
  onParticipantAdded: (id: string) => void;
}

const TeamMemberPanel = ({
  isOpen,
  onClose,
  meetingId,
  currentParticipantIds,
  onParticipantAdded,
}: TeamMemberPanelProps) => {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<ITeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await apiFetch('/api/team', token);
        if (res.ok) {
          const json = await res.json();
          const allMembers: ITeamMember[] = json.data || [];
          setMembers(allMembers.filter((m) => m.status === 'active'));
        }
      } catch (err) {
        console.error('Failed to fetch team members:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [getToken]);

  const filteredMembers = members.filter(
    (member) =>
      member.name?.toLowerCase().includes(search.toLowerCase()) ||
      member.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddToCall = async (memberId: string) => {
    setAddingId(memberId);
    try {
      const token = await getToken();
      const updatedIds = [...currentParticipantIds, memberId];
      const res = await apiFetch(
        `/api/meetings/${meetingId}/participants`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ participantUserIds: updatedIds }),
        }
      );
      if (res.ok) {
        onParticipantAdded(memberId);
        toast({ title: 'Member added to call' });
      } else {
        const json = await res.json();
        toast({ title: json.error || 'Failed to add member' });
      }
    } catch {
      toast({ title: 'Failed to add member' });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section
      className={cn(
        'fixed right-0 top-0 z-40 h-screen w-80 bg-dark-1 border-l border-dark-3 p-4 transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Team Members</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-dark-3 bg-dark-2 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-1 focus:outline-none mb-3"
      />
      {loading && (
        <p className="text-xs text-gray-500 mb-2">Loading team members...</p>
      )}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-160px)]">
        {filteredMembers.map((member) => {
          const isInCall =
            member.memberId != null &&
            currentParticipantIds.includes(member.memberId);
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-dark-3"
            >
              {member.imageUrl ? (
                <Image
                  src={member.imageUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="size-8 rounded-full bg-dark-3 flex items-center justify-center text-xs text-gray-400">
                  {(member.name || member.email)[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {member.name || member.email}
                </p>
                <p className="text-xs text-gray-400 truncate">{member.email}</p>
              </div>
              {isInCall ? (
                <span className="text-xs text-green-400 font-medium">
                  In call
                </span>
              ) : (
                <button
                  onClick={() => handleAddToCall(member.memberId!)}
                  disabled={addingId === member.memberId}
                  className="rounded-md bg-blue-1 px-2 py-1 text-xs text-white hover:bg-blue-600 transition disabled:opacity-50"
                >
                  {addingId === member.memberId ? '...' : 'Add'}
                </button>
              )}
            </div>
          );
        })}
        {!loading && filteredMembers.length === 0 && (
          <p className="text-xs text-gray-500 px-3">
            {members.length === 0
              ? 'No team members yet. Invite members from the Team page.'
              : 'No members match your search.'}
          </p>
        )}
      </div>
    </section>
  );
};

export default TeamMemberPanel;
