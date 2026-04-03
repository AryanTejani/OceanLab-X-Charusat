'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

import { sidebarLinks } from '@/constants';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <section className="sticky left-0 top-0 flex h-screen w-fit flex-col justify-between bg-dark-1 p-6 pt-28 text-white max-sm:hidden lg:w-[264px] border-r border-white/5">
      <div className="flex flex-1 flex-col gap-2">
        {sidebarLinks.map((item) => {
          const isActive =
            pathname === item.route || pathname.startsWith(`${item.route}/`);

          return (
            <Link
              href={item.route}
              key={item.label}
              className={cn(
                'relative flex gap-4 items-center p-4 rounded-xl justify-start transition-colors group',
                isActive ? 'text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              {/* Animated active background — Watermelon macOS sidebar style */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="absolute inset-0 rounded-xl bg-blue-1"
                />
              )}

              {/* Hover highlight for inactive items */}
              {!isActive && (
                <div className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/5 transition-colors" />
              )}

              <Image
                src={item.imgURL}
                alt={item.label}
                width={24}
                height={24}
                className="relative z-10 shrink-0"
              />
              <p className="relative z-10 text-lg font-semibold max-lg:hidden">
                {item.label}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default Sidebar;
