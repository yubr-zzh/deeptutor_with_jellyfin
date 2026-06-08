/**
 * DeepTutor-Plus Avatar Chat Component
 * 
 * React port of Open-TutorAi's AvatarChat.svelte
 * Provides 3D avatar-based chat interface with:
 * - Three.js GLTF model rendering
 * - Lip sync (viseme-based)
 * - Gestures and expressions
 * - Classroom background
 * 
 * Ported from Svelte to React
 * License: Apache 2.0
 */

'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface AvatarChatProps {
  history?: Record<string, any>;
  currentMessage?: string;
  speaking?: boolean;
  className?: string;
  useClassroom?: boolean;
  classroomModel?: 'default' | 'alternative';
  avatarUrl?: string;
  onMessageComplete?: () => void;
}

// Animation settings
const ANIMATION_SETTINGS = {
  headNodIntensity: 0.08,
  headShakeIntensity: 0.07,
  handGestureIntensity: 0.15,
  bodyMovementIntensity: 0.05,
  breathingIntensity: 0.008,
  minGestureInterval: 1800,
  maxGestureInterval: 4000,
  gestureSpeed: 0.9,
  expressionIntensity: 0.7,
  expressionDuration: 1500,
};

const CROSSFADE_DURATION = 0.5;
const MIN_RENDER_SIZE = 320;

// Expression mappings
const EXPRESSIONS: Record<string, string> = {
  smile: 'viseme_smile',
  frown: 'viseme_frown',
  surprise: 'viseme_O',
  squint: 'viseme_CH',
};

export default function AvatarChat({
  history = {},
  currentMessage = '',
  speaking = false,
  className = 'h-full flex pt-8',
  useClassroom = true,
  classroomModel = 'default',
  avatarUrl = '/avatars/glb/The Scholar.glb',
  onMessageComplete,
}: AvatarChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const avatarRef = useRef<THREE.Object3D | null>(null);
  const headMeshRef = useRef<any>(null);
  const animationFrameRef = useRef<number>(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentViseme, setCurrentViseme] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // State for animation
  const clockRef = useRef(new THREE.Clock());
  const currentSentimentRef = useRef(0);
  const activeGestureRef = useRef<string | null>(null);
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const width = Math.max(container.clientWidth, MIN_RENDER_SIZE);
    const height = Math.max(container.clientHeight, MIN_RENDER_SIZE);
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 5);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controlsRef.current = controls;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Load avatar
    loadAvatar(scene);
    
    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      const delta = clockRef.current.getDelta();
      
      // Update controls
      controls.update();
      
      // Avatar animations
      if (avatarRef.current) {
        updateAvatarAnimations(delta);
      }
      
      renderer.render(scene, camera);
    };
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const newWidth = Math.max(container.clientWidth, MIN_RENDER_SIZE);
      const newHeight = Math.max(container.clientHeight, MIN_RENDER_SIZE);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      cancelAnimationFrame(animationFrameRef.current);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      
      // Dispose Three.js objects
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(m => m.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
      }
    };
  }, [avatarUrl]);
  
  // Load avatar model
  const loadAvatar = useCallback((scene: THREE.Scene) => {
    const loader = new GLTFLoader();
    
    loader.load(
      avatarUrl,
      (gltf) => {
        const avatar = gltf.scene;
        const box = new THREE.Box3().setFromObject(avatar);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.4 / maxDim;

        avatar.scale.setScalar(scale);
        avatar.position.set(
          -center.x * scale,
          -box.min.y * scale - 0.95,
          -center.z * scale,
        );
        
        // Enable shadows
        avatar.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        scene.add(avatar);
        avatarRef.current = avatar;
        
        // Try to find head mesh for morph targets
        avatar.traverse((child) => {
          if (child instanceof THREE.Mesh && child.morphTargetDictionary) {
            headMeshRef.current = child;
          }
        });
        
        setLoading(false);
      },
      undefined,
      (error) => {
        console.error('Error loading avatar:', error);
        setError('Failed to load avatar model');
        setLoading(false);
      }
    );
  }, [avatarUrl]);
  
  // Update avatar animations
  const updateAvatarAnimations = useCallback((delta: number) => {
    if (!avatarRef.current) return;
    
    const avatar = avatarRef.current;
    
    // Breathing animation
    const breathing = Math.sin(clockRef.current.getElapsedTime() * 2) * ANIMATION_SETTINGS.breathingIntensity;
    
    // Apply subtle breathing to body
    avatar.position.y = -0.5 + breathing;
    
    // Speaking animation (if speaking)
    if (speaking && headMeshRef.current) {
      // Simple mouth animation based on viseme
      const morphIndex = headMeshRef.current.morphTargetDictionary?.['viseme_AA'] || 0;
      if (morphIndex >= 0) {
        headMeshRef.current.morphTargetInfluences![morphIndex] = 
          Math.sin(clockRef.current.getElapsedTime() * 20) * 0.5 + 0.5;
      }
    }
  }, [speaking]);
  
  // Handle speaking state changes
  useEffect(() => {
    setIsSpeaking(speaking);
  }, [speaking]);
  
  // Handle current message changes (for lip sync)
  useEffect(() => {
    if (currentMessage && speaking) {
      // Simple viseme sequence generation
      const words = currentMessage.split(' ');
      let visemeIndex = 0;
      
      const interval = setInterval(() => {
        if (visemeIndex < words.length) {
          setCurrentViseme(visemeIndex % 10);
          visemeIndex++;
        } else {
          clearInterval(interval);
          setCurrentViseme(0);
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [currentMessage, speaking]);
  
  return (
    <div className={className}>
      <div 
        ref={containerRef} 
        className="relative w-full h-full"
        style={{ minHeight: '400px' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600">Loading avatar...</span>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
            <div className="text-red-600 text-center">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
        
        {/* Avatar controls overlay */}
        <div className="absolute bottom-4 right-4 flex gap-2 z-20">
          <button
            className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"
            title="Reset camera"
            onClick={() => {
              if (cameraRef.current) {
                cameraRef.current.position.set(0, 1.5, 5);
              }
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        
        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-lg z-20">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-700">Speaking...</span>
          </div>
        )}
      </div>
    </div>
  );
}
