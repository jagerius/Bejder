tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import type { Project } from '@/shared/types';

interface Viewer3DProps {
  project: Project;
}

export default function Viewer3D({ project }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#11111f');

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      100
    );
    camera.position.set(0, 0.4, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(2, 3, 4);
    scene.add(ambient, directional);

    const engine = new ProjectionEngine(project);
    const { textureCanvas } = engine.project2D();
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const radiusMm = project.ornamentSpec.diameterMm / 2;
    const radius = Math.max(radiusMm / 50, 0.3);

    // Referencje do zasobów GPU — wszystkie dispozowane w cleanup.
    const geometry = new THREE.SphereGeometry(radius, 96, 64);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.35,
      metalness: 0.05,
    });
    const ornament = new THREE.Mesh(geometry, material);
    scene.add(ornament);

    const rotation = { x: 0, y: 0 };
    const target = { x: 0.4, y: 0.6 };
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTouchDistance: number | null = null;
    let animationFrameId = 0;

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return;
      target.y += (event.clientX - lastX) * 0.005;
      target.x += (event.clientY - lastY) * 0.005;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const handlePointerUp = () => {
      isDragging = false;
    };
    const handleWheel = (event: WheelEvent) => {
      camera.position.z = Math.min(
        5,
        Math.max(0.8, camera.position.z + event.deltaY * 0.001)
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        if (!a || !b) return;
        lastTouchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && lastTouchDistance !== null) {
        const [a, b] = [event.touches[0], event.touches[1]];
        if (!a || !b) return;
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        camera.position.z = Math.min(
          5,
          Math.max(0.8, camera.position.z - (distance - lastTouchDistance) * 0.005)
        );
        lastTouchDistance = distance;
        event.preventDefault();
      }
    };
    const handleTouchEnd = () => {
      lastTouchDistance = null;
    };

    const handleResize = () => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const element = renderer.domElement;
    element.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('wheel', handleWheel, { passive: true });
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('resize', handleResize);

    const animate = () => {
      rotation.x += (target.x - rotation.x) * 0.08;
      rotation.y += (target.y - rotation.y) * 0.08;
      ornament.rotation.set(rotation.x, rotation.y, 0);
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrameId);

      // Pełny cleanup wszystkich listenerów — w tym touch.
      element.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);

      // Dispozycja zasobów GPU — geometria, materiał, tekstura, renderer.
      scene.remove(ornament);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();

      if (element.parentElement === container) {
        container.removeChild(element);
      }
    };
  }, [project]);

  return (
    <section aria-label="Podgląd 3D ornamentu" className="viewer3d">
      <div ref={containerRef} className="viewer3d__canvas" />
    </section>
  );
}