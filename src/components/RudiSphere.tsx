import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RudiState } from '../hooks/useRudi';
import type { AutonomyLevel } from '../utils/autonomy';

interface RudiSphereProps {
  state: RudiState;
  amplitude: number;
  globalToolStatus?: 'idle' | 'running' | 'success' | 'error' | 'blocked';
  autonomyLevel?: AutonomyLevel;
}

const vertexShader = `
  uniform float uTime;
  uniform float uState;
  uniform float uAmplitude;
  uniform float uToolState;
  uniform float uAutonomy;
  uniform float uHover;
  uniform float uPulse;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDistance;
  varying float vToolState;
  
  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vPosition = position;
    vToolState = uToolState;
    float noiseFreq = 1.5;
    float noiseAmp = 0.2;
    if (uToolState > 2.5) { noiseFreq = 5.0; }
    
    vec3 noisePos = vec3(position.x * noiseFreq + uTime, position.y * noiseFreq + uTime, position.z * noiseFreq);
    
    float n = snoise(noisePos);
    
    vec3 pos = position;
    vec3 pNormal = normalize(position);
    
    if (uToolState > 2.5) {
      // Error
      pos += pNormal * (n * 0.4 + sin(uTime * 20.0) * 0.1);
    } else if (uToolState > 1.5) {
      // Success Pulse
      pos += pNormal * (n * 0.1 + sin(uTime * 10.0) * 0.15 + 0.2);
    } else {
      // Standard Flow
      if (uState < 0.5) {
        pos += pNormal * (n * 0.1 + sin(uTime * 0.7) * 0.04);
      } else if (uState < 1.5) {
        pos += pNormal * (n * 0.2 + uAmplitude * 0.5 + 0.1); 
      } else if (uState < 2.5) {
        float scanline = sin(position.y * 10.0 - uTime * 2.0) * 0.08;
        pos += pNormal * (n * 0.1 + scanline);
        pos *= 0.95; 
      } else {
        pos += pNormal * (n * 0.3 + uAmplitude * 1.2 + sin(uTime * 3.0) * 0.08);
      }
    }
    
    pos += pNormal * (uHover * 0.08); 
    
    // Pulse Ripple
    if (uPulse > 0.0) {
      float ripple = sin(vDistance * 15.0 - uTime * 20.0) * 0.15;
      pos += pNormal * ripple * uPulse;
    }
    
    vDistance = distance(pos, vec3(0.0));
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (15.0 / -mvPosition.z) * (1.0 + uAmplitude * 2.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float uState;
  uniform float uAmplitude;
  uniform float uTime;
  uniform float uAutonomy;
  uniform float uHover;
  
  varying vec3 vPosition;
  varying float vDistance;
  varying float vToolState;

  void main() {
    float distToCenter = distance(gl_PointCoord, vec2(0.5));
    if (distToCenter > 0.5) discard;
    
    vec3 color = vec3(0.0, 0.8, 1.0); // Base cyan
    float alpha = 1.0 - (distToCenter * 2.0);
    alpha = pow(alpha, 1.5 + uHover * -0.5); // Softer/brighter core on hover
    
    if (uHover > 0.01) {
      color = mix(color, vec3(1.0), uHover * 0.3); // Whiten on hover
    }
    
    if (uAutonomy > 1.5) {
      color = mix(vec3(0.8, 0.6, 0.0), vec3(1.0, 0.9, 0.3), vDistance);
    } else if (uAutonomy < 0.5) {
      color = mix(vec3(0.0, 0.4, 0.8), vec3(0.0, 0.5, 0.9), vDistance);
    }
    
    if (vToolState > 2.5) {
      // Error/Caution State (Chromatic Aberration)
      float shift = sin(uTime * 15.0 + vPosition.y * 8.0) * 0.5 + 0.5;
      color = mix(vec3(1.0, 0.0, 0.4), vec3(0.0, 1.0, 1.0), shift);
      alpha *= 2.0;
    } else if (vToolState > 1.5) {
      // Success Flash
      color = vec3(0.2, 1.0, 0.8);
      alpha *= 2.0;
    } else {
      if (uState < 0.5) { 
        color = mix(vec3(0.0, 0.4, 0.8), vec3(0.0, 1.0, 0.8), vDistance - 0.8);
        alpha *= 0.6;
      } 
      else if (uState < 1.5) { 
        color = mix(vec3(0.0, 0.8, 0.5), vec3(0.2, 1.0, 0.6), uAmplitude + 0.2); 
        alpha *= 0.8 + uAmplitude;
      } 
      else if (uState < 2.5) { 
        float scan = sin(vPosition.y * 10.0 - uTime * 5.0);
        color = mix(vec3(0.0, 0.2, 0.6), vec3(1.0, 0.9, 0.0), step(0.9, scan)); 
        alpha *= 0.9;
      } 
      else { 
        color = mix(vec3(0.0, 0.5, 1.0), vec3(1.0, 1.0, 1.0), uAmplitude);
        alpha *= 1.0 + uAmplitude * 2.0;
      }
    }
    
    gl_FragColor = vec4(color, alpha * 0.8);
  }
`;


// Per-frame constants were tuned at 60fps; scale by real frame time so the
// look holds at reduced idle rates and on high-refresh displays.
const BASE_FPS = 60;
const MAX_DELTA = 0.1;
const IDLE_FPS = 24;
const REDUCED_MOTION_IDLE_FPS = 15;
const REDUCED_MOTION_SPEED = 0.35;
// Keep full rate this long after activity so lerps settle smoothly.
const SETTLE_MS = 1500;
const AMPLITUDE_EPSILON = 0.01;

const STATE_FLOAT: Record<RudiState, number> = {
  idle: 0.0,
  listening: 1.0,
  thinking: 2.0,
  speaking: 3.0,
  executing: 0.0,
};

const TOOL_STATE_FLOAT: Record<NonNullable<RudiSphereProps['globalToolStatus']>, number> = {
  idle: 0.0,
  running: 1.0,
  success: 2.0,
  error: 3.0,
  blocked: 0.0,
};

const AUTONOMY_FLOAT: Record<AutonomyLevel, number> = { observe: 0.0, assist: 1.0, autonomous: 2.0 };
const AUTONOMY_SPEED: Record<AutonomyLevel, number> = { observe: 0.3, assist: 1.0, autonomous: 1.8 };

// Frame-rate independent equivalent of lerp(a, b, alpha) applied once per 60fps frame.
const damp = (current: number, target: number, alpha: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.pow(1 - alpha, delta * BASE_FPS));

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

type LoopMode = 'full' | 'idle' | 'hidden';

export const RudiSphere = React.memo<RudiSphereProps>(({ state, amplitude, globalToolStatus = 'idle', autonomyLevel = 'assist' }) => {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const pulseRef = useRef(0);

  const ringRef = useRef<THREE.Points>(null);
  const spinnerRef = useRef<THREE.Points>(null);
  const amplitudeRef = useRef(amplitude);

  // Sync prop to ref on every render to ensure useFrame sees the latest value
  amplitudeRef.current = amplitude;

  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = usePrefersReducedMotion();

  // Own clock: setFrameloop() resets the r3f clock, so uTime can't use elapsedTime.
  const timeRef = useRef(0);
  const loopModeRef = useRef<LoopMode | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const activeUntilRef = useRef(0);

  // "full" renders every display frame; "idle" renders on demand at a reduced
  // rate; "hidden" stops rendering until the document is visible again.
  const applyLoopMode = useCallback((mode: LoopMode) => {
    loopModeRef.current = mode;
    if (idleTimerRef.current !== null) {
      window.clearInterval(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (mode === 'full') {
      setFrameloop('always');
    } else if (mode === 'hidden') {
      setFrameloop('never');
    } else {
      setFrameloop('demand');
      const fps = reducedMotion ? REDUCED_MOTION_IDLE_FPS : IDLE_FPS;
      idleTimerRef.current = window.setInterval(() => invalidate(), 1000 / fps);
    }
  }, [setFrameloop, invalidate, reducedMotion]);

  const wake = useCallback(() => {
    activeUntilRef.current = performance.now() + SETTLE_MS;
    if (!document.hidden) applyLoopMode('full');
  }, [applyLoopMode]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) applyLoopMode('hidden');
      else wake();
    };
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleTimerRef.current !== null) window.clearInterval(idleTimerRef.current);
      idleTimerRef.current = null;
      setFrameloop('always');
    };
  }, [applyLoopMode, wake, setFrameloop]);

  // Return to full rate as soon as any visual input changes.
  useEffect(() => {
    wake();
  }, [state, globalToolStatus, autonomyLevel, hovered, wake]);

  const particlesCount = 8000;
  const positions = useMemo(() => {
    const pos = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / particlesCount);
      const theta = Math.sqrt(particlesCount * Math.PI) * phi;
      const r = 1.0;
      pos[i * 3] = r * Math.cos(theta) * Math.sin(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [particlesCount]);

  const ringParticlesCount = 1000;
  const ringPositions = useMemo(() => {
    const pos = new Float32Array(ringParticlesCount * 3);
    for (let i = 0; i < ringParticlesCount; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const radius = 1.31 + (Math.random() - 0.5) * 0.02;
      pos[i * 3] = radius * Math.cos(angle);
      pos[i * 3 + 1] = radius * Math.sin(angle);
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    return pos;
  }, [ringParticlesCount]);

  const spinnerParticlesCount = 600;
  const spinnerPositions = useMemo(() => {
    const pos = new Float32Array(spinnerParticlesCount * 3);
    for (let i = 0; i < spinnerParticlesCount; i++) {
      // Half circle arc of particles
      const angle = (i / spinnerParticlesCount) * Math.PI;
      const radius = 1.2 + (Math.random() - 0.5) * 0.04;
      pos[i * 3] = radius * Math.cos(angle);
      pos[i * 3 + 1] = radius * Math.sin(angle);
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    return pos;
  }, [spinnerParticlesCount]);

  // Created once so React never hands three.js a fresh uniforms object.
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uState: { value: 0 },
    uAmplitude: { value: 0 },
    uToolState: { value: 0 },
    uAutonomy: { value: 1.0 },
    uHover: { value: 0 },
    uPulse: { value: 0 }
  }), []);

  useFrame((sceneState, rawDelta) => {
    // Clamp so a resume after a pause or idle gap doesn't jump the animation.
    const delta = Math.min(rawDelta, MAX_DELTA);
    const speed = reducedMotion ? REDUCED_MOTION_SPEED : 1.0;
    // Per-frame step in units of 60fps frames.
    const step = delta * BASE_FPS * speed;
    timeRef.current += delta * speed;
    const time = timeRef.current;

    let smoothedAmplitude = 0;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.uTime.value = time;
      u.uState.value = STATE_FLOAT[state];
      u.uToolState.value = damp(u.uToolState.value, TOOL_STATE_FLOAT[globalToolStatus], 0.1, delta);
      u.uAutonomy.value = damp(u.uAutonomy.value, AUTONOMY_FLOAT[autonomyLevel], 0.1, delta);
      u.uAmplitude.value = damp(u.uAmplitude.value, amplitudeRef.current, 0.15, delta);
      u.uHover.value = damp(u.uHover.value, hovered ? 1.0 : 0.0, 0.1, delta);
      u.uPulse.value = damp(u.uPulse.value, pulseRef.current, 0.1, delta);
      smoothedAmplitude = u.uAmplitude.value;
    }

    if (pulseRef.current > 0) {
      pulseRef.current -= 0.02 * delta * BASE_FPS; // decay pulse
      if (pulseRef.current < 0) pulseRef.current = 0;
    }

    if (meshRef.current) {
      // Speed up in AUTONOMOUS mode, slow in OBSERVE mode
      const autonomyMult = AUTONOMY_SPEED[autonomyLevel];
      meshRef.current.rotation.y += (globalToolStatus === 'running' ? 0.012 : 0.0008) * autonomyMult * step;
      meshRef.current.rotation.x += (globalToolStatus === 'running' ? 0.006 : 0.0004) * autonomyMult * step;

      if (state === RudiState.Thinking) {
        meshRef.current.rotation.y += 0.005 * step;
      }
    }

    // Animate Overlays
    if (ringRef.current) {
      const ringMaterial = ringRef.current.material as THREE.PointsMaterial;
      ringRef.current.scale.setScalar(1.2 + Math.sin(time * 1.5) * 0.04 + amplitudeRef.current * 0.2);
      ringRef.current.rotation.z += 0.002 * step;
      ringMaterial.opacity = damp(
        ringMaterial.opacity, state === RudiState.Listening ? 0.4 + amplitudeRef.current : 0, 0.05, delta
      );
      // Skip the 1,000-point draw entirely once it has faded out.
      ringRef.current.visible = ringMaterial.opacity > 0.001;
    }

    if (spinnerRef.current) {
      const spinnerMaterial = spinnerRef.current.material as THREE.PointsMaterial;
      spinnerRef.current.rotation.z -= 0.018 * step;
      spinnerMaterial.opacity = damp(
        spinnerMaterial.opacity, state === RudiState.Thinking ? 0.7 : 0, 0.06, delta
      );
      spinnerRef.current.visible = spinnerMaterial.opacity > 0.001;
    }

    // Pick the render rate for the next frame. Re-checked every frame because a
    // <Canvas> re-render resets the frameloop to its own prop.
    const now = performance.now();
    const active =
      state !== RudiState.Idle ||
      globalToolStatus !== 'idle' ||
      hovered ||
      pulseRef.current > 0 ||
      amplitudeRef.current > AMPLITUDE_EPSILON ||
      smoothedAmplitude > AMPLITUDE_EPSILON;
    if (active) activeUntilRef.current = now + SETTLE_MS;

    const mode: LoopMode = document.hidden ? 'hidden' : now < activeUntilRef.current ? 'full' : 'idle';
    const expectedLoop = mode === 'full' ? 'always' : mode === 'idle' ? 'demand' : 'never';
    if (mode !== loopModeRef.current || sceneState.frameloop !== expectedLoop) applyLoopMode(mode);
  });

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={() => { pulseRef.current = 1.0; wake(); }}
    >
      {/* Main Particle Sphere */}
      <points ref={meshRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particlesCount}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={uniforms}
        />
      </points>

      {/* Listening Ring Particles */}
      <points ref={ringRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={ringParticlesCount} array={ringPositions} itemSize={3} args={[ringPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.015} color="#4ade80" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* Thinking Spinner Particles */}
      <points ref={spinnerRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={spinnerParticlesCount} array={spinnerPositions} itemSize={3} args={[spinnerPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.02} color="#facc15" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}, (prev, next) => {
  // Only re-render if core states change. high-frequency amplitude/time is handled in the frame loop.
  return (
    prev.state === next.state &&
    prev.globalToolStatus === next.globalToolStatus &&
    prev.autonomyLevel === next.autonomyLevel
  );
});
