import { useState, useEffect, useCallback } from 'react';
import { checkHealth } from '../services/api.js';

/**
 * Pings the backend health endpoint immediately and every 30s. Returns
 * { online, db } where db is the backend-reported persistence type.
 */
export function useServerHealth() {
  const [serverHealth, setServerHealth] = useState({ online: false, db: null });

  const pingHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setServerHealth({
        online: data.status === 'ok',
        db: data.database?.type || 'neon-postgresql'
      });
    } catch {
      setServerHealth({ online: false, db: null });
    }
  }, []);

  useEffect(() => {
    pingHealth();
    const interval = setInterval(pingHealth, 30000);
    return () => clearInterval(interval);
  }, [pingHealth]);

  return serverHealth;
}

export default useServerHealth;
