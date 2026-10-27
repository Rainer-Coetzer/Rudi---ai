import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import { RudiState } from '../hooks/useRudi';
import type { AutonomyLevel } from '../utils/autonomy';
import { RudiSphere } from './RudiSphere';
import { ErrorBoundary } from './ErrorBoundary';

interface SphereStageProps {
  state: RudiState;
  amplitude: number;
  audioLevel: number;
  isSpeaking: boolean;
  globalToolStatus: 'idle' | 'running' | 'success' | 'error' | 'blocked';
  autonomyLevel: AutonomyLevel;
}

// Fixed per-bar profile for the speaking meter, so render stays pure.
const BAR_COUNT = 18;
const BAR_PROFILE = Array.from({ length: BAR_COUNT }, (_, i) => ({
  peak: 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + 0.4)),
  duration: 0.3 + 0.4 * Math.abs(Math.cos(i * 2.3)),
}));

export const SphereStage: React.FC<SphereStageProps> = ({
  state, amplitude, audioLevel, isSpeaking, globalToolStatus, autonomyLevel,
}) => {
  return (
    <div className="relative flex-1 min-h-0 w-full" aria-hidden>
      <ErrorBoundary
        fallback={
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border border-cyan-500/20 bg-cyan-500/5 animate-pulse" />
          </div>
        }
      >
        <div className="absolute inset-0">
          <Canvas camera={{ position: [0, 0, 3], fov: 45 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
            <ambientLight intensity={0.3} />
            <RudiSphere
              state={state}
              amplitude={amplitude}
              globalToolStatus={globalToolStatus}
              autonomyLevel={autonomyLevel}
            />
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.1}
                luminanceSmoothing={globalToolStatus === 'error' ? 0.1 : 0.9}
                height={500}
                intensity={
                  globalToolStatus === 'error'   ? 5.5 :
                  globalToolStatus === 'success' ? 4.0 :
                  state === RudiState.Speaking   ? 3.2 + amplitude * 2.5 :
                  state === RudiState.Listening  ? 2.8 + amplitude * 1.5 :
                  state === RudiState.Thinking   ? 2.5 : 2.0
                }
              />
            </EffectComposer>
          </Canvas>
        </div>
      </ErrorBoundary>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 80%, rgba(0,0,0,0.8) 100%)' }}
      />

      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-7 pointer-events-none"
          >
            {BAR_PROFILE.map((bar, i) => (
              <motion.div
                key={i}
                className="w-0.5 bg-cyan-400/70 rounded-full"
                animate={{
                  height: [4, 4 + bar.peak * 24 * audioLevel, 4],
                  opacity: [0.4, 0.8, 0.4]
                }}
                transition={{
                  repeat: Infinity,
                  duration: bar.duration,
                  delay: i * 0.04,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
