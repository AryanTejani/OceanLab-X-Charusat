'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';
import { ITeamMember } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';

interface InviteMemberModalProps {
  onClose: () => void;
  onSuccess: (member: ITeamMember) => void;
}

const InviteMemberModal = ({ onClose, onSuccess }: InviteMemberModalProps) => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { getToken } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast({ title: 'Please enter a valid email address' });
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await apiFetch('/api/team/invite', token, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        onSuccess(json.data);
      } else {
        toast({ title: json.error || 'Failed to send invitation' });
      }
    } catch {
      toast({ title: 'Failed to send invitation' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-dark-1 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="invite-email" className="text-sm text-gray-400 mb-1 block">
              Email Address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full rounded-md border border-dark-3 bg-dark-2 px-3 py-2 text-white placeholder-gray-500 focus:border-blue-1 focus:outline-none"
              autoFocus
              disabled={submitting}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-400 hover:text-white transition"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-1 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InviteMemberModal;
