tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import type { Project } from '@/shared/types';

interface Viewer3DProps {
  project: Project;
}

// Fix #3: disposeMesh obsługuje zarówno MeshStandardMaterial, jak i tablicę
// materiałów (Array.isArray) — niektóre geometrie (np. z multi-material groups)
// zwracają material jako tablicę; bez tego tylko pierwszy element byłby zwalniany
function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}

export default function Viewer3D({ project }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  // Fix #2: cameraStateRef przechowuje pozycję i target kamery między renderami
  // efektów — kamera nie jest resetowana przy każdej zmianie patternMap
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  // Fix #4: sphereGeometryRef przechowuje geometrię niezależnie od patternMap —
  // geometria zależy wyłącznie od diameterMm i nie jest odtwarzana przy malowaniu
  const sphereGeometryRef = useRef<THREE.SphereGeometry | null>(null);

  // Fix #1, #2: inicjalizacja sceny — tylko przy mount/unmount lub zmianie projectId.
  // Zmiana patternMap NIE resetuje kamery ani sceny — tekstura jest podmieniana
  // przez osobny efekt [project] poniżej.
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const radiusMm = project.ornamentSpec.diameterMm / 2;

    // Fix #2: przywracamy zapisaną pozycję kamery jeśli istnieje —
    // użytkownik nie traci orientacji po każdym pomalowaniu koralika
    if (cameraStateRef.current) {
      camera.position.copy(cameraStateRef.current.position);
    } else {
      camera.position.set(0, radiusMm * 2, radiusMm * 3);
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Fix #2: przywracamy zapisany target OrbitControls jeśli istnieje
    if (cameraStateRef.current) {
      controls.target.copy(cameraStateRef.current.target);
    } else {
      controls.target.set(0, 0, 0);
    }
    controls.update();

    // Fix #2: zapisujemy stan kamery przy każdej zmianie — efekt [project]
    // może go przywrócić bez resetowania orientacji użytkownika
    controls.addEventListener('change', () => {
      cameraStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
    });
    controlsRef.current = controls;

    // Fix #4: geometria tworzona raz tutaj — zależy wyłącznie od diameterMm.
    // Zmiana patternMap (malowanie) nie odtwarza geometrii — podmienia tylko
    // teksturę na istniejącym materiale przez osobny efekt poniżej.
    const sphereRadius = radiusMm;
    const geometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
    sphereGeometryRef.current = geometry;

    const engine = new ProjectionEngine(project);
    const { textureCanvas } = engine.project2D();
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      if (meshRef.current) {
        disposeMesh(meshRef.current);
        meshRef.current = null;
      }
      sphereGeometryRef.current = null;
    };
    // Fix #2: deps [project.projectId, project.ornamentSpec.diameterMm] —
    // reset sceny tylko przy zmianie projektu lub średnicy, nie przy malowaniu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectId, project.ornamentSpec.diameterMm]);

  // Fix #4: podmiana tekstury przy każdej zmianie patternMap — geometria i kamera
  // pozostają nietknięte; aktualizujemy tylko material.map i needsUpdate
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const engine = new ProjectionEngine(project);
    const { textureCanvas } = engine.project2D();
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = mesh.material as THREE.MeshStandardMaterial;
    if (material.map) {
      material.map.dispose();
    }
    material.map = texture;
    material.needsUpdate = true;
  }, [project]);

  return (
    <div
      ref={containerRef}
      className="viewer-3d"
      aria-label="Podgląd ornamentu 3D"
      style={{ width: '100%', height: '100%' }}
    />
  );
}