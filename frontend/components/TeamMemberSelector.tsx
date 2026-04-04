'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';
import { ITeamMember } from '@/lib/types';

interface TeamMemberSelectorProps {
  selectedMemberIds: string[];
  onSelectionChange: (memberIds: string[]) => void;
}

const TeamMemberSelector = ({
  selectedMemberIds,
  onSelectionChange,
}: TeamMemberSelectorProps) => {
  const { getToken } = useAuth();
  const [members, setMembers] = useState<ITeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-gray-400">Add Team Members</label>
      <input
        type="text"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border border-dark-3 bg-dark-2 px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-1 focus:outline-none"
      />
      <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
        {filteredMembers.map((member) => {
          const isSelected =
            member.memberId != null &&
            selectedMemberIds.includes(member.memberId);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                if (!member.memberId) return;
                if (isSelected) {
                  onSelectionChange(
                    selectedMemberIds.filter((id) => id !== member.memberId)
                  );
                } else {
                  onSelectionChange([...selectedMemberIds, member.memberId]);
                }
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition ${
                isSelected
                  ? 'bg-blue-1/20 text-blue-400'
                  : 'hover:bg-dark-3 text-white'
              }`}
            >
              {member.imageUrl ? (
                <Image
                  src={member.imageUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              ) : (
                <div className="size-6 rounded-full bg-dark-3 flex items-center justify-center text-xs text-gray-400">
                  {(member.name || member.email)[0].toUpperCase()}
                </div>
              )}
              <span>{member.name || member.email}</span>
              {isSelected && (
                <span className="ml-auto text-blue-400 text-xs">Selected</span>
              )}
            </button>
          );
        })}
      </div>
      {loading && (
        <p className="text-xs text-gray-500">Loading team members...</p>
      )}
      {!loading && members.length === 0 && (
        <p className="text-xs text-gray-500">
          No team members yet. Invite members from the Team page.
        </p>
      )}
    </div>
  );
};

export default TeamMemberSelector;
