import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { RudiState } from '../hooks/useRudi';

interface MicButtonProps {
  state: RudiState;
  toggleListening: () => void;
  audioAmplitude?: number; // Pass this specifically if we want the mic button to glow based on voice!
}

export const MicButton: React.FC<MicButtonProps> = ({ state, toggleListening, audioAmplitude = 0 }) => {
  
  const intensity = audioAmplitude;
  const boxShadowStyle = state === RudiState.Listening 
    ? { boxShadow: `0 0 ${10 + intensity * 20}px rgba(74,222,128,${0.5 + intensity})` }
    : {};

  return (
    <button
      type="button"
      onClick={toggleListening}
      style={boxShadowStyle}
      className={`p-4 transition rounded-full ${
        state === RudiState.Listening 
          ? 'text-green-400 border border-green-500 bg-green-500/10' 
          : 'text-white/50 hover:text-white border border-transparent'
      }`}
    >
      {state === RudiState.Listening ? <Mic size={24} /> : <MicOff size={24} />}
    </button>
  );
};
