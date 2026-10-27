import { useState, useEffect } from 'react';

export interface SystemHealth {
  ollama: 'ready' | 'unavailable' | 'checking';
  voice: 'ready' | 'fallback' | 'checking' | 'unavailable';
  model: string;
  claude: boolean;
  currentMode?: string;
}

const HEALTH_CHECK_URL = 'http://localhost:3001/api/health';

export function useHealthMonitor() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    ollama: 'checking',
    voice: 'checking',
    model: 'llama3.2:1b',
    claude: false,
  });

  useEffect(() => {
    // Listen for platform mode changes (Electron specific)
    if (window.desktopAPI?.onModeChange) {
      window.desktopAPI.onModeChange((newMode: string) => {
        setSystemHealth(prev => ({ ...prev, currentMode: newMode }));
      });
    }
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(HEALTH_CHECK_URL);
        if (res.ok) {
          const data = await res.json();
          setSystemHealth(prev => ({
            ...prev,
            ollama: data.ollama === 'ready' ? 'ready' : 'unavailable',
            voice: data.voice ? 'ready' : 'unavailable',
            model: data.model || 'Rudi Engine',
            claude: !!data.claude,
          }));
        }
      } catch {
        setSystemHealth(prev => ({
          ...prev,
          ollama: 'unavailable',
          voice: 'unavailable',
        }));
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return { systemHealth };
}
