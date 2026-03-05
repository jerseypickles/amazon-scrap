"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Float } from "@react-three/drei";
import * as THREE from "three";

interface MetricPillar {
  label: string;
  value: string;
  normalizedHeight: number; // 0-1
  color: string;
}

function Pillar({
  pillar,
  index,
  total,
}: {
  pillar: MetricPillar;
  index: number;
  total: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const spacing = 1.6;
  const xOffset = (index - (total - 1) / 2) * spacing;
  const maxH = 2.5;
  const h = Math.max(0.1, pillar.normalizedHeight * maxH);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.scale.y = THREE.MathUtils.lerp(
        meshRef.current.scale.y,
        1,
        0.03
      );
    }
  });

  return (
    <group position={[xOffset, 0, 0]}>
      {/* Pillar base glow */}
      <mesh position={[0, -1.2, 0]}>
        <planeGeometry args={[0.9, 0.05]} />
        <meshBasicMaterial color={pillar.color} transparent opacity={0.15} />
      </mesh>

      {/* Pillar */}
      <Float speed={1.5} floatIntensity={0.05}>
        <RoundedBox
          ref={meshRef}
          args={[0.7, h, 0.7]}
          radius={0.08}
          position={[0, h / 2 - 1.2, 0]}
        >
          <meshStandardMaterial
            color={pillar.color}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </RoundedBox>
      </Float>

      {/* Top cap glow */}
      <mesh position={[0, h - 1.2 + 0.05, 0]}>
        <planeGeometry args={[0.7, 0.02]} />
        <meshBasicMaterial color={pillar.color} transparent opacity={0.5} />
      </mesh>

      {/* Value text */}
      <Text
        position={[0, h - 1.2 + 0.35, 0.4]}
        fontSize={0.18}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {pillar.value}
      </Text>

      {/* Label text */}
      <Text
        position={[0, -1.6, 0]}
        fontSize={0.12}
        color="#8b92a8"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.2}
      >
        {pillar.label}
      </Text>
    </group>
  );
}

export default function MetricPillars3D({
  metrics,
}: {
  metrics: MetricPillar[];
}) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <Canvas
        camera={{ position: [0, 0.5, 6], fov: 40 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} intensity={0.8} color="#ffffff" />
        <pointLight position={[-3, 3, 3]} intensity={0.4} color="#6366f1" />
        {metrics.map((m, i) => (
          <Pillar key={m.label} pillar={m} index={i} total={metrics.length} />
        ))}
      </Canvas>
    </div>
  );
}
