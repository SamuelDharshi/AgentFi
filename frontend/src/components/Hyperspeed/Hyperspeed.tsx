"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from "postprocessing";

type RangeValue = number | number[];

interface HyperspeedColors {
  roadColor: number;
  islandColor: number;
  background: number;
  shoulderLines: number;
  brokenLines: number;
  leftCars: number[];
  rightCars: number[];
  sticks: number;
}

export interface HyperspeedEffectOptions {
  distortion?: string;
  length?: number;
  roadWidth?: number;
  islandWidth?: number;
  lanesPerRoad?: number;
  fov?: number;
  fovSpeedUp?: number;
  speedUp?: number;
  carLightsFade?: number;
  totalSideLightSticks?: number;
  lightPairsPerRoadWay?: number;
  shoulderLinesWidthPercentage?: number;
  brokenLinesWidthPercentage?: number;
  brokenLinesLengthPercentage?: number;
  lightStickWidth?: RangeValue;
  lightStickHeight?: RangeValue;
  movingAwaySpeed?: RangeValue;
  movingCloserSpeed?: RangeValue;
  carLightsLength?: RangeValue;
  carLightsRadius?: RangeValue;
  carWidthPercentage?: RangeValue;
  carShiftX?: RangeValue;
  carFloorSeparation?: RangeValue;
  colors?: Partial<HyperspeedColors>;
}

type ResolvedHyperspeedEffectOptions = {
  distortion: string;
  length: number;
  roadWidth: number;
  islandWidth: number;
  lanesPerRoad: number;
  fov: number;
  fovSpeedUp: number;
  speedUp: number;
  carLightsFade: number;
  totalSideLightSticks: number;
  lightPairsPerRoadWay: number;
  shoulderLinesWidthPercentage: number;
  brokenLinesWidthPercentage: number;
  brokenLinesLengthPercentage: number;
  lightStickWidth: RangeValue;
  lightStickHeight: RangeValue;
  movingAwaySpeed: RangeValue;
  movingCloserSpeed: RangeValue;
  carLightsLength: RangeValue;
  carLightsRadius: RangeValue;
  carWidthPercentage: RangeValue;
  carShiftX: RangeValue;
  carFloorSeparation: RangeValue;
  colors: HyperspeedColors;
};

interface HyperspeedProps {
  effectOptions?: HyperspeedEffectOptions;
}

const DEFAULT_OPTIONS: ResolvedHyperspeedEffectOptions = {
  distortion: "turbulentDistortion",
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [12, 80],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0xffffff,
    brokenLines: 0xffffff,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3,
  },
};

function mergeOptions(
  effectOptions?: HyperspeedEffectOptions
): ResolvedHyperspeedEffectOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...effectOptions,
    colors: {
      ...DEFAULT_OPTIONS.colors,
      ...effectOptions?.colors,
      leftCars: effectOptions?.colors?.leftCars ?? DEFAULT_OPTIONS.colors.leftCars,
      rightCars: effectOptions?.colors?.rightCars ?? DEFAULT_OPTIONS.colors.rightCars,
    },
  };
}

function toCssColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function pickRange(value: RangeValue, fallback: number): number {
  if (typeof value === "number") {
    return value;
  }

  if (value.length === 0) {
    return fallback;
  }

  if (value.length === 1) {
    return value[0];
  }

  const [min, max] = value;
  return min + Math.random() * (max - min);
}

function buildRoadTexture(options: ResolvedHyperspeedEffectOptions): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 4096;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize the Hyperspeed texture canvas.");
  }

  const roadColor = toCssColor(options.colors.roadColor);
  const islandColor = toCssColor(options.colors.islandColor);
  const backgroundColor = toCssColor(options.colors.background);
  const shoulderColor = toCssColor(options.colors.shoulderLines);
  const brokenColor = toCssColor(options.colors.brokenLines);

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const roadGradient = context.createLinearGradient(0, 0, canvas.width, 0);
  roadGradient.addColorStop(0, "#000000");
  roadGradient.addColorStop(0.18, roadColor);
  roadGradient.addColorStop(0.5, roadColor);
  roadGradient.addColorStop(0.82, roadColor);
  roadGradient.addColorStop(1, "#000000");
  context.fillStyle = roadGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const islandWidth = Math.max(
    24,
    Math.round(canvas.width * (options.islandWidth / (options.roadWidth + options.islandWidth * 2)) * 0.85)
  );
  const islandX = Math.round(canvas.width / 2 - islandWidth / 2);
  context.fillStyle = islandColor;
  context.fillRect(islandX, 0, islandWidth, canvas.height);

  const shoulderWidth = Math.max(4, Math.round(canvas.width * options.shoulderLinesWidthPercentage * 0.08));
  context.fillStyle = shoulderColor;
  context.fillRect(Math.round(canvas.width * 0.07), 0, shoulderWidth, canvas.height);
  context.fillRect(Math.round(canvas.width * 0.93 - shoulderWidth), 0, shoulderWidth, canvas.height);

  const lanes = Math.max(1, Math.round(options.lanesPerRoad));
  const dashHeight = Math.max(24, Math.round(256 * options.brokenLinesLengthPercentage));
  const dashGap = Math.max(18, Math.round(dashHeight * 0.75));
  const lineWidth = Math.max(2, Math.round(canvas.width * options.brokenLinesWidthPercentage * 0.04));
  context.strokeStyle = brokenColor;
  context.lineWidth = lineWidth;
  context.lineCap = "round";

  for (let lane = 1; lane < lanes; lane += 1) {
    const x = Math.round((lane / lanes) * canvas.width);
    context.setLineDash([dashHeight, dashGap]);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = 0; y < canvas.height; y += 128) {
    const alpha = 0.02 + (y % 256 === 0 ? 0.02 : 0);
    context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    context.fillRect(0, y, canvas.width, 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createSolidMaterial(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

export default function Hyperspeed({ effectOptions }: HyperspeedProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => mergeOptions(effectOptions), [effectOptions]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(options.colors.background);
    scene.fog = new THREE.Fog(options.colors.background, 45, options.length * 1.1);

    const camera = new THREE.PerspectiveCamera(options.fov, 1, 0.1, 2000);
    camera.position.set(0, 8.5, -160);
    camera.lookAt(0, 0.5, 120);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(1, 1, false);
    renderer.setClearColor(options.colors.background, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({
          blendFunction: BlendFunction.SCREEN,
          intensity: 1.25,
          luminanceThreshold: 0.16,
          luminanceSmoothing: 0.75,
        })
      )
    );

    const roadTexture = buildRoadTexture(options);
    const roadGeometry = new THREE.PlaneGeometry(options.roadWidth + options.islandWidth * 2 + 10, options.length, 1, 1);
    const roadMaterial = new THREE.MeshStandardMaterial({
      map: roadTexture,
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0.02,
    });
    const roadPlane = new THREE.Mesh(roadGeometry, roadMaterial);
    roadPlane.rotation.x = -Math.PI / 2;
    roadPlane.position.y = 0;
    scene.add(roadPlane);

    const islandGeometry = new THREE.PlaneGeometry(options.islandWidth, options.length, 1, 1);
    const islandMaterial = new THREE.MeshBasicMaterial({
      color: options.colors.islandColor,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const islandPlane = new THREE.Mesh(islandGeometry, islandMaterial);
    islandPlane.rotation.x = -Math.PI / 2;
    islandPlane.position.set(0, 0.02, 0);
    scene.add(islandPlane);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(-18, 28, -35);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(options.colors.sticks, 1.4, 240);
    rimLight.position.set(0, 12, -50);
    scene.add(rimLight);

    const movingObjects: Array<{
      object: THREE.Object3D;
      speed: number;
      wrapMin: number;
      wrapMax: number;
      baseOpacity: number;
    }> = [];

    const halfLength = options.length / 2;
    const sideEdgeX = options.roadWidth / 2 + options.islandWidth / 2 + 0.9;

    const sideStickCount = Math.max(6, Math.round(options.totalSideLightSticks));
    for (let index = 0; index < sideStickCount; index += 1) {
      const z = -halfLength + (options.length / sideStickCount) * index;
      const width = pickRange(options.lightStickWidth, 0.2);
      const height = pickRange(options.lightStickHeight, 1.5);
      const stickGeometry = new THREE.BoxGeometry(width, height, width * 0.7);
      const stickMaterial = createSolidMaterial(options.colors.sticks, 0.92);
      const leftStick = new THREE.Mesh(stickGeometry, stickMaterial.clone());
      const rightStick = new THREE.Mesh(stickGeometry, stickMaterial.clone());
      leftStick.position.set(-sideEdgeX, height / 2, z);
      rightStick.position.set(sideEdgeX, height / 2, z);

      scene.add(leftStick, rightStick);

      movingObjects.push({
        object: leftStick,
        speed: pickRange(options.movingAwaySpeed, 70),
        wrapMin: -halfLength,
        wrapMax: halfLength,
        baseOpacity: 0.9,
      });

      movingObjects.push({
        object: rightStick,
        speed: pickRange(options.movingCloserSpeed, -140),
        wrapMin: -halfLength,
        wrapMax: halfLength,
        baseOpacity: 0.9,
      });
    }

    const trafficCount = Math.max(8, Math.round(options.lightPairsPerRoadWay));
    for (let index = 0; index < trafficCount; index += 1) {
      const z = -halfLength + (options.length / trafficCount) * index;
      const carLength = pickRange(options.carLightsLength, 36);
      const carRadius = Math.max(0.04, pickRange(options.carLightsRadius, 0.1));
      const carWidth = Math.max(0.8, pickRange(options.carWidthPercentage, 0.4) * options.roadWidth);
      const shift = pickRange(options.carShiftX, 0);
      const floorSeparation = pickRange(options.carFloorSeparation, 0);
      const directionPalette = index % 2 === 0 ? options.colors.leftCars : options.colors.rightCars;
      const color = directionPalette[index % directionPalette.length];
      const streakGeometry = new THREE.BoxGeometry(carLength, carRadius * 2.2, carRadius * 2.2);
      const streakMaterial = createSolidMaterial(color, 0.95);
      const carGroup = new THREE.Group();

      const leftStreak = new THREE.Mesh(streakGeometry, streakMaterial.clone());
      const rightStreak = new THREE.Mesh(streakGeometry, streakMaterial.clone());
      leftStreak.rotation.y = Math.PI / 2;
      rightStreak.rotation.y = Math.PI / 2;
      leftStreak.position.x = -carWidth / 2;
      rightStreak.position.x = carWidth / 2;
      carGroup.add(leftStreak, rightStreak);
      carGroup.position.set(shift * options.roadWidth * 0.35, 0.14 + floorSeparation * 0.02, z);

      scene.add(carGroup);

      const speed = index % 2 === 0
        ? pickRange(options.movingAwaySpeed, 72)
        : pickRange(options.movingCloserSpeed, -150);

      movingObjects.push({
        object: carGroup,
        speed,
        wrapMin: -halfLength,
        wrapMax: halfLength,
        baseOpacity: options.carLightsFade,
      });
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frame = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      const scrollSpeed = Math.max(0.03, options.speedUp * 0.035 + options.fovSpeedUp * 0.00012);

      roadTexture.offset.y = (roadTexture.offset.y - delta * scrollSpeed) % 1;
      camera.position.x = Math.sin(elapsed * 0.28) * (options.distortion === "turbulentDistortion" ? 0.2 : 0.08);
      camera.position.y = 8.5 + Math.sin(elapsed * 0.45) * 0.12;
      camera.lookAt(0, 0.45, 120);

      for (const item of movingObjects) {
        const object = item.object;
        object.position.z += item.speed * delta;

        if (item.speed > 0 && object.position.z > item.wrapMax) {
          object.position.z = item.wrapMin;
        } else if (item.speed < 0 && object.position.z < item.wrapMin) {
          object.position.z = item.wrapMax;
        }

        const depthFactor = 1 - Math.min(1, Math.abs(object.position.z - camera.position.z) / options.length);
        const opacity = Math.max(0.08, item.baseOpacity * (0.35 + depthFactor * 0.65));

        object.traverse((child) => {
          if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
            child.material.opacity = opacity;
            child.material.transparent = true;
          }
        });

        object.rotation.z = Math.sin(elapsed * 0.6 + object.position.z * 0.01) * 0.02;
      }

      composer.render(delta);
      frame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();

      composer.dispose();
      roadTexture.dispose();
      for (const item of movingObjects) {
        disposeObject(item.object);
      }
      disposeObject(roadPlane);
      disposeObject(islandPlane);

      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [options]);

  return <div id="lights" ref={mountRef} aria-hidden="true" />;
}
