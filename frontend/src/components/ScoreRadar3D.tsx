"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, Line } from "@react-three/drei";
import * as THREE from "three";

interface ScoreAxis {
  label: string;
  score: number | null;
  color: string;
}

function scoreColor(s: number | null): string {
  if (s === null) return "#4a5068";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function RadarShape({ axes, loading }: { axes: ScoreAxis[]; loading?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.15;
      groupRef.current.rotation.x = Math.sin(t * 0.2) * 0.05;
    }
  });

  const maxRadius = 1.8;

  // Calculate 3D positions for each axis
  const positions = useMemo(() => {
    return axes.map((axis, i) => {
      const angle = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
      const v = loading ? 0 : (axis.score ?? 0) / 100;
      const r = v * maxRadius;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: 0,
        labelX: Math.cos(angle) * (maxRadius + 0.5),
        labelY: Math.sin(angle) * (maxRadius + 0.5),
        fullX: Math.cos(angle) * maxRadius,
        fullY: Math.sin(angle) * maxRadius,
      };
    });
  }, [axes, loading]);

  // Shape vertices
  const shapePoints = useMemo(() => {
    const pts = positions.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    pts.push(pts[0]); // close the shape
    return pts;
  }, [positions]);

  // Filled polygon shape
  const filledShape = useMemo(() => {
    if (positions.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(positions[0].x, positions[0].y);
    for (let i = 1; i < positions.length; i++) {
      shape.lineTo(positions[i].x, positions[i].y);
    }
    shape.closePath();
    return shape;
  }, [positions]);

  // Grid rings
  const gridRings = [0.25, 0.5, 0.75, 1.0];

  return (
    <group ref={groupRef}>
      {/* Grid rings */}
      {gridRings.map((frac) => {
        const r = frac * maxRadius;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -0.01));
        }
        return (
          <Line
            key={frac}
            points={pts}
            color="#1e2336"
            lineWidth={0.5}
            transparent
            opacity={0.4}
          />
        );
      })}

      {/* Axis lines */}
      {positions.map((p, i) => (
        <Line
          key={`axis-${i}`}
          points={[new THREE.Vector3(0, 0, -0.01), new THREE.Vector3(p.fullX, p.fullY, -0.01)]}
          color="#1e2336"
          lineWidth={0.5}
          transparent
          opacity={0.3}
        />
      ))}

      {/* Filled area */}
      {filledShape && !loading && (
        <mesh ref={meshRef} position={[0, 0, 0]}>
          <shapeGeometry args={[filledShape]} />
          <meshBasicMaterial
            color="#6366f1"
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Outline */}
      {!loading && (
        <Line
          points={shapePoints}
          color="#6366f1"
          lineWidth={2}
          transparent
          opacity={0.8}
        />
      )}

      {/* Score dots at vertices */}
      {!loading && positions.map((p, i) => (
        <group key={`dot-${i}`}>
          {/* Glow */}
          <mesh position={[p.x, p.y, 0.01]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshBasicMaterial color={axes[i].color} transparent opacity={0.3} />
          </mesh>
          {/* Dot */}
          <mesh position={[p.x, p.y, 0.02]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color={axes[i].color} />
          </mesh>
        </group>
      ))}

      {/* Labels */}
      {positions.map((p, i) => (
        <group key={`label-${i}`}>
          <Text
            position={[p.labelX, p.labelY, 0]}
            fontSize={0.16}
            color="#8b92a8"
            anchorX="center"
            anchorY="middle"
          >
            {axes[i].label}
          </Text>
          <Text
            position={[p.labelX, p.labelY - 0.25, 0]}
            fontSize={0.22}
            color={scoreColor(axes[i].score)}
            anchorX="center"
            anchorY="middle"
          >
            {axes[i].score ?? "--"}
          </Text>
        </group>
      ))}
    </group>
  );
}

export default function ScoreRadar3D({
  demand,
  competition,
  price,
  quality,
  loading,
}: {
  demand: number | null;
  competition: number | null;
  price: number | null;
  quality: number | null;
  loading?: boolean;
}) {
  const axes: ScoreAxis[] = [
    { label: "Demanda", score: demand, color: "#10b981" },
    { label: "Competencia", score: competition, color: "#6366f1" },
    { label: "Calidad", score: quality, color: "#ef4444" },
    { label: "Precio", score: price, color: "#f59e0b" },
  ];

  return (
    <div style={{ width: "100%", height: 320 }}>
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.8} />
        <RadarShape axes={axes} loading={loading} />
      </Canvas>
    </div>
  );
}
