tsx
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import type { Project } from '@/shared/types';

interface Viewer3DProps {
  project: Project;
}

export default function Viewer3D({ project }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Fix #1: animFrameRef inicjalizowany na 0; 0 = brak aktywnej klatki animacji
  const animFrameRef = useRef(0);

  const engine = useMemo(() => new ProjectionEngine(project), [project]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10101a');

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const radiusMm = project.ornamentSpec.diameterMm / 2;
    camera.position.set(0, radiusMm * 1.5, radiusMm * 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(1, 1, 1);
    scene.add(directional);

    const result = engine.project2D();
    const texture = new THREE.CanvasTexture(result.textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.SphereGeometry(radiusMm, 96, 96);
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      sphere.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      // Fix #1: reset do 0 po cancelAnimationFrame — brak ryzyka
      // błędnego anulowania nowej klatki po remount komponentu
      if (animFrameRef.current !== 0) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      texture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [engine, project.ornamentSpec.diameterMm]);

  return (
    <section aria-label="Podgląd 3D" className="viewer-3d">
      <div
        ref={containerRef}
        className="viewer-3d__viewport"
        aria-label="Interaktywny podgląd ornamentu 3D"
      />
    </section>
  );
}