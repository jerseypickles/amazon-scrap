"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Text, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

function scoreColor(s: number | null): string {
  if (s === null) return "#4a5068";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function Orb({ score, loading }: { score: number | null; loading?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const color = scoreColor(score);
  const v = score ?? 0;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.3;
      meshRef.current.rotation.x = Math.sin(t * 0.2) * 0.1;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.3 + Math.sin(t * 2) * 0.05);
    }
  });

  const ringSegments = useMemo(() => {
    const count = 64;
    const filled = Math.floor((v / 100) * count);
    return { count, filled };
  }, [v]);

  if (loading) {
    return (
      <Float speed={4} floatIntensity={0.5}>
        <mesh>
          <sphereGeometry args={[0.8, 32, 32]} />
          <meshStandardMaterial color="#1e2336" wireframe transparent opacity={0.3} />
        </mesh>
      </Float>
    );
  }

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.04} />
      </mesh>

      {/* Progress ring */}
      {Array.from({ length: ringSegments.count }).map((_, i) => {
        const angle = (i / ringSegments.count) * Math.PI * 2 - Math.PI / 2;
        const isFilled = i < ringSegments.filled;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 1.15, Math.sin(angle) * 1.15, 0]}
          >
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial
              color={isFilled ? color : "#1e2336"}
              transparent
              opacity={isFilled ? 0.9 : 0.3}
            />
          </mesh>
        );
      })}

      {/* Main orb */}
      <Float speed={2} floatIntensity={0.3}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[0.8, 64, 64]} />
          <MeshDistortMaterial
            color={color}
            roughness={0.2}
            metalness={0.8}
            distort={0.15}
            speed={2}
            transparent
            opacity={0.85}
          />
        </mesh>
      </Float>

      {/* Score text */}
      <Text
        position={[0, 0, 1.05]}
        fontSize={0.6}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.woff"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {score ?? "--"}
      </Text>

      {/* Label */}
      <Text
        position={[0, -1.6, 0]}
        fontSize={0.18}
        color="#8b92a8"
        anchorX="center"
        anchorY="middle"
      >
        OPPORTUNITY SCORE
      </Text>
    </group>
  );
}

export default function ScoreOrb3D({
  score,
  loading,
}: {
  score: number | null;
  loading?: boolean;
}) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={1} color={scoreColor(score)} />
        <pointLight position={[-5, -5, 5]} intensity={0.5} color="#6366f1" />
        <Orb score={score} loading={loading} />
      </Canvas>
    </div>
  );
}
