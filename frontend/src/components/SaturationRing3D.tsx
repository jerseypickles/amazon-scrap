"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface SaturationSegment {
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
  color: string;
}

function Ring({ segments, verdict }: { segments: SaturationSegment[]; verdict: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.15;
    }
  });

  const ringData = useMemo(() => {
    const innerR = 1.0;
    const outerR = 1.6;
    const depth = 0.4;
    let startAngle = 0;

    return segments
      .filter((s) => s.pct > 0)
      .map((seg) => {
        const sweepAngle = (seg.pct / 100) * Math.PI * 2;
        const midAngle = startAngle + sweepAngle / 2;
        const result = {
          ...seg,
          startAngle,
          sweepAngle,
          midAngle,
          innerR,
          outerR,
          depth,
          labelX: Math.cos(midAngle) * (outerR + 0.4),
          labelZ: Math.sin(midAngle) * (outerR + 0.4),
        };
        startAngle += sweepAngle;
        return result;
      });
  }, [segments]);

  return (
    <group ref={groupRef}>
      {ringData.map((seg, i) => {
        const shape = new THREE.Shape();
        const segs = 32;

        // Outer arc
        for (let j = 0; j <= segs; j++) {
          const a = seg.startAngle + (j / segs) * seg.sweepAngle;
          const x = Math.cos(a) * seg.outerR;
          const y = Math.sin(a) * seg.outerR;
          if (j === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }

        // Inner arc (reverse)
        for (let j = segs; j >= 0; j--) {
          const a = seg.startAngle + (j / segs) * seg.sweepAngle;
          shape.lineTo(Math.cos(a) * seg.innerR, Math.sin(a) * seg.innerR);
        }

        shape.closePath();

        const extrudeSettings = { depth: seg.depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 };

        return (
          <group key={i}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -seg.depth / 2, 0]}>
              <extrudeGeometry args={[shape, extrudeSettings]} />
              <meshStandardMaterial
                color={seg.color}
                roughness={0.3}
                metalness={0.5}
                transparent
                opacity={0.85}
              />
            </mesh>
            {/* Label */}
            {seg.pct >= 8 && (
              <Text
                position={[seg.labelX, 0.3, seg.labelZ]}
                fontSize={0.14}
                color={seg.color}
                anchorX="center"
                anchorY="middle"
              >
                {`${seg.shortLabel} ${seg.pct.toFixed(0)}%`}
              </Text>
            )}
          </group>
        );
      })}

      {/* Center verdict text */}
      <Text
        position={[0, 0.1, 0]}
        fontSize={0.2}
        color={
          verdict === "Saturado"
            ? "#ef4444"
            : verdict === "Moderado"
            ? "#f59e0b"
            : "#10b981"
        }
        anchorX="center"
        anchorY="middle"
      >
        {verdict}
      </Text>
    </group>
  );
}

export default function SaturationRing3D({
  newcomers,
  growing,
  established,
  dominant,
  newcomersPct,
  growingPct,
  establishedPct,
  dominantPct,
  verdict,
}: {
  newcomers: number;
  growing: number;
  established: number;
  dominant: number;
  newcomersPct: number;
  growingPct: number;
  establishedPct: number;
  dominantPct: number;
  verdict: string;
}) {
  const segments: SaturationSegment[] = [
    { label: "Nuevos (<50 rev)", shortLabel: "Nuevos", count: newcomers, pct: newcomersPct, color: "#10b981" },
    { label: "Crecimiento (50-200)", shortLabel: "Crec.", count: growing, pct: growingPct, color: "#6366f1" },
    { label: "Establecidos (200-1K)", shortLabel: "Estab.", count: established, pct: establishedPct, color: "#f59e0b" },
    { label: "Dominantes (1K+)", shortLabel: "Dom.", count: dominant, pct: dominantPct, color: "#ef4444" },
  ];

  return (
    <div style={{ width: "100%", height: 280 }}>
      <Canvas
        camera={{ position: [0, 3, 3.5], fov: 40 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-3, 3, -3]} intensity={0.4} color="#6366f1" />
        <Ring segments={segments} verdict={verdict} />
      </Canvas>
    </div>
  );
}
