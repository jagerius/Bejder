tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import type { Project } from '@/shared/types';

interface Viewer3DProps {
  project: Project;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.Mesh | null;
  animationFrameId: number;
}

// Fix #2: helper do disposal mesha — wywoływany zarówno przy podmianie mesh
// (drugi useEffect) jak i przy unmount (cleanup pierwszego useEffect)
function disposeMesh(mesh: THREE.Mesh): void {
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.map?.dispose();
  material.dispose();
  mesh.geometry.dispose();
}

export default function Viewer3D({ project }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Fix #5: scena przechowywana w useRef — tworzona raz, aktualizowana
  // przez osobny useEffect bez remountu całego WebGL kontekstu
  const sceneRefsRef = useRef<SceneRefs | null>(null);

  // Fix #5: pierwszy useEffect — inicjalizacja sceny, renderer, kamera, controls.
  // Uruchamia się dokładnie raz ([] deps). Cleanup niszczy renderer i controls.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);

    // Fix #4: przywrócone OrbitControls — interaktywny obrót i zoom kamery
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Fix #1: ResizeObserver zamiast window resize — reaguje na zmianę
    // rozmiaru kontenera (np. przy przełączaniu zakładek, zmianie layoutu),
    // a nie tylko na zmianę rozmiaru okna przeglądarki
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        // Fix #4: continue zamiast return — pomija zerowe wymiary
        // bez przerywania przetwarzania pozostałych entries
        if (w === 0 || h === 0) continue;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    resizeObserver.observe(container);

    const refs: SceneRefs = {
      renderer,
      scene,
      camera,
      controls,
      mesh: null,
      animationFrameId: 0,
    };
    sceneRefsRef.current = refs;

    const animate = () => {
      refs.animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(refs.animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      // Fix #2: dispose mesh przed zniszczeniem renderer — tekstura i geometria
      // są zwalniane z pamięci GPU; bez tego przy unmount następował wyciek
      if (refs.mesh) {
        scene.remove(refs.mesh);
        disposeMesh(refs.mesh);
        refs.mesh = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefsRef.current = null;
    };
  }, []);

  // Fix #5: drugi useEffect — aktualizuje wyłącznie geometrię/teksturę mesh
  // przy zmianie projektu. Nie tworzy nowej sceny ani renderer — tylko
  // podmienia mesh w istniejącej scenie (O(1) koszt aktualizacji).
  // Fix #3: pozycja kamery i limity zoomu skalowane do diameterMm projektu
  useEffect(() => {
    const refs = sceneRefsRef.current;
    if (!refs) return;

    const radius = project.ornamentSpec.diameterMm / 2;

    // Fix #3: kamera skalowana do rozmiaru ornamentu — sztywne (0,0,220)
    // było poprawne tylko dla diameterMm ≈ 80 mm; teraz działa dla każdego rozmiaru
    refs.camera.position.set(0, 0, radius * 3.5);
    refs.controls.minDistance = radius * 1.2;
    refs.controls.maxDistance = radius * 8;
    refs.controls.update();

    const engine = new ProjectionEngine(project);
    const result = engine.project2D();

    const texture = new THREE.CanvasTexture(result.textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.SphereGeometry(radius, 64, 48);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);

    if (refs.mesh) {
      refs.scene.remove(refs.mesh);
      disposeMesh(refs.mesh);
    }

    refs.scene.add(mesh);
    refs.mesh = mesh;
  }, [project]);

  return (
    <section aria-label="Podgląd 3D" className="viewer-3d">
      {/* Fix #2: role="img" przywrócone — kontener canvas reprezentuje
          wizualizację 3D, wymaga opisu dla czytników ekranu */}
      <div
        ref={containerRef}
        className="viewer-3d__container"
        aria-label="Interaktywny podgląd 3D ornamentu — przeciągnij aby obrócić, scroll aby przybliżyć"
        role="img"
      />
    </section>
  );
}