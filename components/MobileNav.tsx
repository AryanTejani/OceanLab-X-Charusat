'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { sidebarLinks } from '@/constants';
import { cn } from '@/lib/utils';

const MobileNav = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="w-full max-w-[264px]">
      {/* Hamburger trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="sm:hidden cursor-pointer"
        aria-label="Open navigation"
      >
        <Image
          src="/icons/hamburger.svg"
          width={36}
          height={36}
          alt="hamburger icon"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              key="mobile-nav-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 z-50 h-full w-[264px] border-r border-white/10 bg-dark-1 p-6 text-white shadow-2xl"
            >
              <Link
                href="/"
                className="flex items-center gap-2 mb-8"
                onClick={() => setIsOpen(false)}
              >
                <Image
                  src="/icons/logo.svg"
                  width={32}
                  height={32}
                  alt="MeetMind AI logo"
                />
                <p className="text-[26px] font-extrabold text-white">
                  MeetMind <span className="text-blue-1">AI</span>
                </p>
              </Link>

              <nav className="flex flex-col gap-3">
                {sidebarLinks.map((item) => {
                  const isActive = pathname === item.route;

                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'flex items-center gap-4 rounded-xl p-4 font-semibold transition-colors',
                        isActive
                          ? 'bg-blue-1 text-white'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Image
                        src={item.imgURL}
                        alt={item.label}
                        width={20}
                        height={20}
                      />
                      <p>{item.label}</p>
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
};

export default MobileNav;
