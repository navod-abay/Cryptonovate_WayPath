import { useEffect, useState } from 'react';
import { now } from '@/mock/clock';

/** Current (demo) time, refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}
