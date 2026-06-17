// passing: interactive button with motion/react feedback
import { motion } from 'motion/react';

export function PassingButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      Click me
    </motion.button>
  );
}
