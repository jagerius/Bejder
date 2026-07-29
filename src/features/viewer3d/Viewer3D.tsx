tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ProjectionEngine } from '@/domain/projection/ProjectionEngine';
import type { Project } from '@/shared/types';

interface Viewer3DProps {
  project: Project;
}

const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 480;

function getContainerSize(container: HTMLDivElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  const width =
    container.clientWidth ||
    Math.round(rect.width) ||
    FALLBACK_WIDTH;
  const height =
    container.clientHeight ||
    Math.round(rect.height) ||
    FALLBACK_HEIGHT;

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function disposeTexture(texture: THREE.Texture | null | undefined): void {
  texture?.dispose();
}

function disposeMaterial(material: THREE.Material): void {
  const texturedMaterial = material as THREE.MeshStandardMaterial & {
    alphaMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    displacementMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    envMap?: THREE.Texture | null;
    lightMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
  };

  disposeTexture(texturedMaterial.map);
  disposeTexture(texturedMaterial.alphaMap);
  disposeTexture(texturedMaterial.aoMap);
  disposeTexture(texturedMaterial.bumpMap);
  disposeTexture(texturedMaterial.displacementMap);
  disposeTexture(texturedMaterial.emissiveMap);
  disposeTexture(texturedMaterial.envMap);
  disposeTexture(texturedMaterial.lightMap);
  disposeTexture(texturedMaterial.metalnessMap);
  disposeTexture(texturedMaterial.normalMap);
  disposeTexture(texturedMaterial.roughnessMap);
  material.dispose();
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  disposeMaterial(material);
}

export default function Viewer3D({ project }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const cameraStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // Fix #3: efekt inicjalizacji zależy wyłącznie od tożsamości projektu i średnicy,
  // więc zmiana patternMap/palety nie resetuje całej sceny ani kamery.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = getContainerSize(container);
    const radius = project.ornamentSpec.diameterMm / 2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10141f');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    if (cameraStateRef.current) {
      camera.position.copy(cameraStateRef.current.position);
    } else {
      camera.position.set(0, 0, radius * 3);
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    if (cameraStateRef.current) {
      controls.target.copy(cameraStateRef.current.target);
    } else {
      controls.target.set(0, 0, 0);
    }
    controls.update();

    const handleControlsChange = () => {
      cameraStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
    };
    controls.addEventListener('change', handleControlsChange);
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.35);
    directionalLight.position.set(radius * 2, radius * 2, radius * 3);
    scene.add(directionalLight);

    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    const engine = new ProjectionEngine(project);
    const { textureCanvas } = engine.project2D();
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.72,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    scene.add(mesh);

    let frameId = 0;
    const renderFrame = () => {
      frameId = window.requestAnimationFrame(renderFrame);
      controls.update();
      renderer.render(scene, camera);
    };
    renderFrame();

    // Fix #2 i #4: ResizeObserver reaguje na zmianę rozmiaru samego kontenera,
    // a getContainerSize zapewnia fallbacki także wtedy, gdy width/height startują od 0.
    const resizeObserver = new ResizeObserver(() => {
      const nextContainer = containerRef.current;
      const nextRenderer = rendererRef.current;
      const nextCamera = cameraRef.current;
      if (!nextContainer || !nextRenderer || !nextCamera) return;

      const nextSize = getContainerSize(nextContainer);
      nextCamera.aspect = nextSize.width / nextSize.height;
      nextCamera.updateProjectionMatrix();
      nextRenderer.setSize(nextSize.width, nextSize.height, false);
      nextRenderer.render(scene, nextCamera);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
      controls.removeEventListener('change', handleControlsChange);
      controls.dispose();

      if (meshRef.current) {
        scene.remove(meshRef.current);
        disposeMesh(meshRef.current);
        meshRef.current = null;
      }

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [project.projectId, project.ornamentSpec.diameterMm]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    const engine = new ProjectionEngine(project);
    const { textureCanvas } = engine.project2D();
    const nextTexture = new THREE.CanvasTexture(textureCanvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.needsUpdate = true;

    disposeTexture(material.map);
    material.map = nextTexture;
    material.needsUpdate = true;
  }, [project]);

  return (
    <div
      ref={containerRef}
      className="viewer3d"
      aria-label="Podgląd 3D ornamentu"
      style={{ width: '100%', height: '100%', minHeight: '420px' }}
    />
  );
}