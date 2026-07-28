tsx
import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useAppSelector, useAppDispatch } from '@/app/store';
import { setSelectedSegment } from '@/app/store/editorSlice';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';

interface Viewer3DProps {
  projectId: string;
  fullscreen?: boolean;
}

export default function Viewer3D({ projectId, fullscreen }: Viewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    sphere: THREE.Mesh;
    animId: number;
    isDragging: boolean;
    lastMouse: { x: number; y: number };
    rotX: number;
    rotY: number;
  } | null>(null);

  const dispatch = useAppDispatch();
  const project = useAppSelector((state) =>
    state.projects.projects.find((p) => p.projectId === projectId)
  );

  const textureCanvas = useMemo(() => {
    if (!project) return null;
    const engine = new ProjectionEngine(project);
    return engine.generateTexture(1024);
  }, [project?.patternMap, project?.ornamentSpec, project?.palette]);

  useEffect(() => {
    if (!mountRef.current || !project) return;

    const mount = mountRef.current;
    const w = mount.clientWidth || 300;
    const h = mount.clientHeight || 300;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x12122a, 1);
    mount.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 3);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    backLight.position.set(-3, -3, -3);
    scene.add(backLight);

    // Sphere
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.1,
    });

    if (textureCanvas) {
      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.needsUpdate = true;
      material.map = texture;
    }

    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Cap
    const capGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 8);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0xc0a000,
      metalness: 0.8,
      roughness: 0.2,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.set(0, 1.1, 0);
    scene.add(cap);

    // Wire hook
    const hookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.18, 0),
      new THREE.Vector3(0.1, 1.3, 0),
      new THREE.Vector3(0.15, 1.4, 0),
    ]);
    const hookGeo = new THREE.TubeGeometry(hookCurve, 10, 0.01, 6, false);
    const hookMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
    const hook = new THREE.Mesh(hookGeo, hookMat);
    scene.add(hook);

    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };
    let rotX = 0;
    let rotY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      rotY += dx * 0.01;
      rotX += dy * 0.01;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      sphere.rotation.y = rotY;
      sphere.rotation.x = rotX;
      lastMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      camera.position.z = Math.max(1.5, Math.min(6, camera.position.z + e.deltaY * 0.005));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

    // Touch support
    let lastTouchDist = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    });
    renderer.domElement.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouse.x;
        const dy = e.touches[0].clientY - lastMouse.y;
        rotY += dx * 0.01;
        rotX += dy * 0.01;
        sphere.rotation.y = rotY;
        sphere.rotation.x = rotX;
        lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        camera.position.z = Math.max(1.5, Math.min(6, camera.position.z + (lastTouchDist - dist) * 0.01));
        lastTouchDist = dist;
      }
    });
    renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

    // Animate
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(mount);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      sphere,
      animId,
      isDragging,
      lastMouse,
      rotX,
      rotY,
    };

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      resizeObserver.disconnect();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update texture when project changes
  useEffect(() => {
    if (!sceneRef.current || !textureCanvas) return;
    const { sphere } = sceneRef.current;
    const material = sphere.material as THREE.MeshStandardMaterial;

    if (material.map) {
      (material.map as THREE.CanvasTexture).dispose();
    }
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    material.map = texture;
    material.needsUpdate = true;
  }, [textureCanvas]);

  return (
    <div className={`relative bg-[#12122a] ${fullscreen ? 'h-full' : 'h-full'}`}>
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 text-xs text-gray-500 pointer-events-none">
        🖱 Obróć • Scroll: zoom
      </div>
    </div>
  );
}