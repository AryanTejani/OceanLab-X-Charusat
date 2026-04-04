'use client';

import { useEffect } from 'react';
import { useGetCalls } from '@/hooks/useGetCalls';
import { Call } from '@stream-io/video-react-sdk';

const noMeetingMessages = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning is all yours — no calls ahead';
  if (hour < 17) return 'Afternoon is clear — no meetings scheduled';
  return 'Evening is free — nothing on the books';
};

const formatMeetingTime = (startsAt: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const meetingDay = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());

  const time = startsAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (meetingDay.getTime() === today.getTime()) return `Today at ${time}`;
  if (meetingDay.getTime() === tomorrow.getTime()) return `Tomorrow at ${time}`;
  return startsAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${time}`;
};

const UpcomingMeetingBadge = () => {
  const { upcomingCalls, isLoading, refetch } = useGetCalls();

  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener('meeting-scheduled', handler);
    return () => window.removeEventListener('meeting-scheduled', handler);
  }, [refetch]);

  if (isLoading) {
    return (
      <h2 className="glassmorphism max-w-[273px] rounded py-2 text-center text-base font-normal">
        &nbsp;
      </h2>
    );
  }

  const next = upcomingCalls
    ?.filter((c: Call) => c.state?.startsAt)
    .sort((a: Call, b: Call) =>
      new Date(a.state.startsAt!).getTime() - new Date(b.state.startsAt!).getTime()
    )[0];

  const label = next
    ? `Next meeting: ${formatMeetingTime(new Date(next.state.startsAt!))}`
    : noMeetingMessages();

  return (
    <h2 className="glassmorphism max-w-[273px] rounded py-2 text-center text-base font-normal">
      {label}
    </h2>
  );
};

export default UpcomingMeetingBadge;
