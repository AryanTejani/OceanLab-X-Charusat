'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';
import Image from 'next/image';

type Step = 'role' | 'org-name';
type Role = 'owner' | 'member';

export default function OnboardingPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRoleSelect = (selected: Role) => {
    setRole(selected);
    if (selected === 'owner') {
      setStep('org-name');
    } else {
      // Members just complete onboarding immediately
      handleSubmit('member');
    }
  };

  const handleSubmit = async (forcedRole?: Role) => {
    const finalRole = forcedRole || role;
    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      const res = await apiFetch('/api/organization/setup', token, {
        method: 'POST',
        body: JSON.stringify({
          type: finalRole,
          organizationName: finalRole === 'owner' ? orgName.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || 'Setup failed. Please try again.');
        return;
      }

      router.replace(finalRole === 'owner' ? '/team' : '/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-dark-2 px-4">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icons/logo.svg" width={36} height={36} alt="MeetMind AI" />
        <span className="text-2xl font-extrabold text-white">
          MeetMind <span className="text-blue-1">AI</span>
        </span>
      </div>

      {step === 'role' && (
        <div className="w-full max-w-md rounded-2xl bg-dark-1 p-8 shadow-xl">
          <h1 className="mb-2 text-2xl font-bold text-white">Welcome aboard!</h1>
          <p className="mb-8 text-gray-400">
            How will you be using MeetMind AI?
          </p>

          <div className="flex flex-col gap-4">
            <button
              onClick={() => handleRoleSelect('owner')}
              disabled={loading}
              className="group flex items-start gap-4 rounded-xl border border-dark-3 bg-dark-2 p-5 text-left transition hover:border-blue-1 hover:bg-dark-3"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-1/20 text-blue-1 group-hover:bg-blue-1/30">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">I&apos;m an Organization</p>
                <p className="mt-1 text-sm text-gray-400">
                  Create an organization, invite team members, and manage meetings together.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleRoleSelect('member')}
              disabled={loading}
              className="group flex items-start gap-4 rounded-xl border border-dark-3 bg-dark-2 p-5 text-left transition hover:border-blue-1 hover:bg-dark-3"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 group-hover:bg-purple-500/30">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">I&apos;m a Member</p>
                <p className="mt-1 text-sm text-gray-400">
                  Join an organization when invited. Participate in team meetings and view insights.
                </p>
              </div>
            </button>
          </div>

          {loading && (
            <p className="mt-6 text-center text-sm text-gray-400">Setting up your account…</p>
          )}
          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      )}

      {step === 'org-name' && (
        <div className="w-full max-w-md rounded-2xl bg-dark-1 p-8 shadow-xl">
          <button
            onClick={() => { setStep('role'); setError(''); }}
            className="mb-6 flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
          >
            ← Back
          </button>

          <h1 className="mb-2 text-2xl font-bold text-white">Name your organization</h1>
          <p className="mb-8 text-gray-400">
            This is how your team members will recognize your organization.
          </p>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && orgName.trim() && handleSubmit()}
              placeholder="e.g. Acme Corp, My Startup…"
              className="w-full rounded-lg border border-dark-3 bg-dark-2 px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-blue-1 transition"
              autoFocus
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              onClick={() => handleSubmit()}
              disabled={!orgName.trim() || loading}
              className="w-full rounded-lg bg-blue-1 px-4 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Setting up…' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
