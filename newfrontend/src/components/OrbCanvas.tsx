import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Edges, Text, PerspectiveCamera, Environment, ContactShadows, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

function HbarLogo() {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  return (
    <group ref={meshRef} scale={0.5}>
      {/* The Coin Disc - Glassy/Metallic */}
      <mesh>
        <cylinderGeometry args={[0.8, 0.8, 0.15, 64]} rotation={[Math.PI / 2, 0, 0]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          metalness={1} 
          roughness={0.1} 
        />
      </mesh>
      
      {/* The 'H' Bars - Glowing Purple */}
      <group position={[0, 0, 0.08]}>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.5, 0.05, 0.04]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={10} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[0.5, 0.05, 0.04]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={10} />
        </mesh>
        <mesh position={[-0.18, 0, 0]}>
          <boxGeometry args={[0.05, 0.5, 0.04]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={10} />
        </mesh>
        <mesh position={[0.18, 0, 0]}>
          <boxGeometry args={[0.05, 0.5, 0.04]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={10} />
        </mesh>
      </group>
    </group>
  );
}

function ModularCube() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.1;
      groupRef.current.rotation.x = time * 0.05;
    }
  });

  // Create a grid of smaller cubes
  const blocks = useMemo(() => {
    const items = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Skip the center where the logo goes
          if (x === 0 && y === 0 && z === 0) continue;
          
          // Randomly skip some blocks for a modular look
          if (Math.random() > 0.6) continue;

          items.push({
            position: [x * 0.8, y * 0.8, z * 0.8],
            scale: 0.7,
            type: Math.random() > 0.4 ? 'glass' : 'metal'
          });
        }
      }
    }
    return items;
  }, []);

  return (
    <group ref={groupRef} scale={0.8} position={[1, 0, 0]}>
      {blocks.map((block, i) => (
        <mesh key={i} position={block.position as [number, number, number]} scale={block.scale}>
          <boxGeometry />
          {block.type === 'glass' ? (
            <MeshTransmissionMaterial 
              backside 
              samples={4} 
              thickness={0.5} 
              chromaticAberration={0.02} 
              anisotropy={0.1} 
              distortion={0.1} 
              distortionScale={0.1} 
              temporalDistortion={0.1} 
              color="#a855f7"
            />
          ) : (
            <meshStandardMaterial color="#111" metalness={1} roughness={0.2} />
          )}
          <Edges color="#a855f7" threshold={15}>
            <meshBasicMaterial color="#a855f7" transparent opacity={0.5} />
          </Edges>
        </mesh>
      ))}

      {/* Central HBAR Logo */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <HbarLogo />
      </Float>

      {/* "Hedera" Text in 3D - Positioned like the video */}
      <Text
        position={[0, -1.5, 0.5]}
        fontSize={0.2}
        color="#a855f7"
        font="https://fonts.gstatic.com/s/spacegrotesk/v13/V8mQoQDjQSkFLXnUyAsSdaCcAdx_WBa_m2Y.woff"
        anchorX="center"
        anchorY="middle"
        maxWidth={2}
      >
        HEDERA NETWORK
      </Text>

      {/* Glowing Lines */}
      <group>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[4, 0.01, 0.01]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.2} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[4, 0.01, 0.01]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.2} />
        </mesh>
      </group>

      <pointLight position={[5, 5, 5]} intensity={2} color="#a855f7" />
      <pointLight position={[-5, -5, -5]} intensity={1} color="#3b82f6" />
      <ambientLight intensity={0.2} />
    </group>
  );
}

export default function OrbCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative">
      <div className="absolute inset-0 bg-purple-500/5 blur-[100px] rounded-full scale-75 animate-pulse" />
      <Canvas dpr={[1, 2]} shadows>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ModularCube />
        <ContactShadows position={[0, -2.5, 0]} opacity={0.4} scale={10} blur={2} far={4.5} />
        <Environment preset="night" />
      </Canvas>
    </div>
  );
}
