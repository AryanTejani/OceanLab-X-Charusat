import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ShimmerButton } from './ui/shimmer-button';

interface PermissionCardProps {
  title: string;
  iconUrl?: string;
}

const Alert = ({ title, iconUrl }: PermissionCardProps) => {
  return (
    <section className="flex-center h-screen w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-[520px] rounded-xl border border-white/10 bg-dark-1 p-6 py-9 text-white shadow-xl"
      >
        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-3.5">
            {iconUrl && (
              <div className="flex-center">
                <Image src={iconUrl} width={72} height={72} alt="icon" />
              </div>
            )}
            <p className="text-center text-xl font-semibold">{title}</p>
          </div>

          <Link href="/" className="w-full">
            <ShimmerButton className="w-full bg-blue-1 hover:bg-blue-1/90 text-white font-semibold py-3 rounded-lg">
              Back to Home
            </ShimmerButton>
          </Link>
        </div>
      </motion.div>
    </section>
  );
};

export default Alert;
