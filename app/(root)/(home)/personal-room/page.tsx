"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Copy, CheckCircle } from "lucide-react";

import { useGetCallById } from "@/hooks/useGetCallById";

const Table = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <div className="flex flex-col items-start gap-2 xl:flex-row">
      <h1 className="text-base font-medium text-sky-1 lg:text-xl xl:min-w-32">
        {title}:
      </h1>
      <h1 className="truncate text-sm font-bold max-sm:max-w-[320px] lg:text-xl">
        {description}
      </h1>
    </div>
  );
};

const PersonalRoom = () => {
  const router = useRouter();
  const { user } = useUser();
  const client = useStreamVideoClient();
  const [copied, setCopied] = useState(false);

  const meetingId = user?.id;
  const { call } = useGetCallById(meetingId!);

  const startRoom = async () => {
    if (!client || !user) return;

    const newCall = client.call("default", meetingId!);

    if (!call) {
      await newCall.getOrCreate({
        data: {
          starts_at: new Date().toISOString(),
        },
      });
    }

    router.push(`/meeting/${meetingId}?personal=true`);
  };

  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}?personal=true`;

  const handleCopy = () => {
    navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="flex size-full flex-col gap-10 text-white">
      <h1 className="text-xl font-bold lg:text-3xl">Personal Meeting Room</h1>
      <div className="flex w-full flex-col gap-8 xl:max-w-[900px]">
        <Table title="Topic" description={`${user?.username}'s Meeting Room`} />
        <Table title="Meeting ID" description={meetingId!} />
        <Table title="Invite Link" description={meetingLink} />
      </div>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={startRoom}
          className="flex items-center gap-2 rounded-lg bg-blue-1 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-1/90"
        >
          <Play size={16} />
          Start Meeting
        </button>

        <button
          onClick={handleCopy}
          className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 ${
            copied
              ? "bg-green-600/20 text-green-400 border border-green-500/30"
              : "bg-dark-3 text-white hover:bg-dark-4"
          }`}
        >
          {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy Invitation"}
        </button>
      </div>

      {/* Watermelon UI-style inline toast */}
      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full border border-white/10 bg-dark-1 px-5 py-3 text-white shadow-2xl"
          >
            <CheckCircle size={18} className="text-green-400 shrink-0" />
            <span className="text-sm font-medium">Link Copied</span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default PersonalRoom;
