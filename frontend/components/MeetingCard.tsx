"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useToast } from "./ui/use-toast";

interface MeetingMember {
  name?: string;
  image?: string;
}

interface MeetingCardProps {
  title: string;
  date: string;
  icon: string;
  isPreviousMeeting?: boolean;
  buttonIcon1?: string;
  buttonText?: string;
  handleClick: () => void;
  link: string;
  members?: MeetingMember[];
}

const MAX_VISIBLE = 4;

const MemberAvatar = ({ member, index }: { member: MeetingMember; index: number }) => {
  const initials = (member.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const style = { top: 0, left: index * 28 };

  if (member.image) {
    return (
      <Image
        src={member.image}
        alt={member.name || 'attendee'}
        width={40}
        height={40}
        className={cn("rounded-full object-cover border-2 border-dark-1", { absolute: index > 0 })}
        style={style}
      />
    );
  }

  return (
    <div
      className={cn(
        "size-10 rounded-full bg-blue-1 border-2 border-dark-1 flex items-center justify-center text-white text-xs font-semibold",
        { absolute: index > 0 }
      )}
      style={index > 0 ? style : undefined}
      title={member.name}
    >
      {initials}
    </div>
  );
};

const MeetingCard = ({
  icon,
  title,
  date,
  isPreviousMeeting,
  buttonIcon1,
  handleClick,
  link,
  buttonText,
  members = [],
}: MeetingCardProps) => {
  const { toast } = useToast();
  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - MAX_VISIBLE;

  return (
    <section className="flex min-h-[258px] w-full flex-col justify-between rounded-[14px] bg-dark-1 px-5 py-8 xl:max-w-[568px]">
      <article className="flex flex-col gap-5">
        <Image src={icon} alt="upcoming" width={28} height={28} />
        <div className="flex justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-base font-normal">{date}</p>
          </div>
        </div>
      </article>
      <article className={cn("flex justify-center relative", {})}>
        <div className="relative flex w-full max-sm:hidden">
          {visible.map((member, index) => (
            <MemberAvatar key={index} member={member} index={index} />
          ))}
          {overflow > 0 && (
            <div
              className="flex-center absolute size-10 rounded-full border-2 border-dark-1 bg-dark-4 text-xs font-medium text-white"
              style={{ top: 0, left: visible.length * 28 }}
            >
              +{overflow}
            </div>
          )}
        </div>
        {!isPreviousMeeting && (
          <div className="flex gap-2">
            <Button onClick={handleClick} className="rounded bg-blue-1 px-6">
              {buttonIcon1 && (
                <Image src={buttonIcon1} alt="feature" width={20} height={20} />
              )}
              &nbsp; {buttonText}
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast({
                  title: "Link Copied",
                });
              }}
              className="bg-dark-4 px-6"
            >
              <Image
                src="/icons/copy.svg"
                alt="feature"
                width={20}
                height={20}
              />
              &nbsp; Copy Link
            </Button>
          </div>
        )}
      </article>
    </section>
  );
};

export default MeetingCard;
