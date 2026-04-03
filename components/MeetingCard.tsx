"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Calendar, Copy, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { ShimmerButton } from "./ui/shimmer-button";
import { avatarImages } from "@/constants";
import { useState } from "react";

interface MeetingCardProps {
  title: string;
  date: string;
  icon: string;
  isPreviousMeeting?: boolean;
  buttonIcon1?: string;
  buttonText?: string;
  handleClick: () => void;
  link: string;
}

const MeetingCard = ({
  icon,
  title,
  date,
  isPreviousMeeting,
  buttonIcon1,
  handleClick,
  link,
  buttonText,
}: MeetingCardProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="flex min-h-[258px] w-full flex-col justify-between rounded-[14px] bg-dark-1 px-5 py-8 xl:max-w-[568px] border border-white/5"
    >
      <article className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-blue-1/20">
            <Image src={icon} alt="meeting type" width={22} height={22} />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="text-sm font-normal text-sky-1">{date}</p>
          </div>
        </div>

        {/* Participants avatars */}
        <div className="relative flex w-full max-sm:hidden items-center">
          {avatarImages.map((img, index) => (
            <Image
              key={index}
              src={img}
              alt="attendee"
              width={40}
              height={40}
              className={cn("rounded-full border-2 border-dark-3", {
                absolute: index > 0,
              })}
              style={{ top: 0, left: index * 28 }}
            />
          ))}
          <div className="flex-center absolute left-[136px] size-10 rounded-full border-[5px] border-dark-3 bg-dark-4 text-sm font-medium text-white">
            +5
          </div>
        </div>
      </article>

      {!isPreviousMeeting && (
        <article className="flex gap-2 flex-wrap">
          <ShimmerButton
            onClick={handleClick}
            className="bg-blue-1 hover:bg-blue-1/90 text-white text-sm px-5 py-2 rounded-lg flex items-center gap-2"
          >
            {buttonIcon1 ? (
              <Image src={buttonIcon1} alt="action" width={16} height={16} />
            ) : (
              <Play size={14} />
            )}
            {buttonText}
          </ShimmerButton>

          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200",
              copied
                ? "bg-green-600/20 text-green-400 border border-green-500/30"
                : "bg-dark-4 text-white hover:bg-dark-3"
            )}
          >
            <Copy size={14} />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </article>
      )}
    </motion.section>
  );
};

export default MeetingCard;
