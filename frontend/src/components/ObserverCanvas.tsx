"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function ObserverCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050713, 9, 22);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 0, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x86b4ff, 0.65);
    scene.add(ambient);

    const key = new THREE.PointLight(0x2ee6c9, 1.2, 25);
    key.position.set(4, 2, 7);
    scene.add(key);

    const system = new THREE.Group();
    scene.add(system);

    const nodeCount = 120;
    const nodePositions = new Float32Array(nodeCount * 3);
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < nodeCount; i += 1) {
      const radius = 3 + Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      nodePositions[i * 3] = x;
      nodePositions[i * 3 + 1] = y;
      nodePositions[i * 3 + 2] = z;
      nodes.push(new THREE.Vector3(x, y, z));
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));

    const nodeMaterial = new THREE.PointsMaterial({
      color: 0x8cd4ff,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const points = new THREE.Points(nodeGeometry, nodeMaterial);
    system.add(points);

    const linkVertices: number[] = [];
    const maxLinks = 170;
    for (let i = 0; i < maxLinks; i += 1) {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const b = nodes[Math.floor(Math.random() * nodes.length)];
      if (a.distanceToSquared(b) > 24) continue;
      linkVertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linkVertices, 3)
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x32ffc2,
      transparent: true,
      opacity: 0.24,
    });

    const links = new THREE.LineSegments(lineGeometry, lineMaterial);
    system.add(links);

    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.03, 16, 140),
      new THREE.MeshBasicMaterial({ color: 0x4d7fff, transparent: true, opacity: 0.35 })
    );
    frame.rotation.x = Math.PI * 0.5;
    system.add(frame);

    const resize = () => {
      if (!mount) return;
      const width = Math.max(220, mount.clientWidth);
      const height = Math.max(220, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const t = clock.getElapsedTime();
      system.rotation.y = t * 0.18;
      system.rotation.x = Math.sin(t * 0.3) * 0.08;
      frame.rotation.z = t * 0.2;
      points.material.opacity = 0.65 + Math.sin(t * 1.7) * 0.18;
      links.material.opacity = 0.18 + Math.sin(t * 1.2) * 0.08;

      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      mount.removeChild(renderer.domElement);

      nodeGeometry.dispose();
      nodeMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      frame.geometry.dispose();
      (frame.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="panel-card h-[320px] overflow-hidden p-0 md:h-[420px]">
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
