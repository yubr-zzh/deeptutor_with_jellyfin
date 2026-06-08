/**
 * DeepTutor-Plus Avatar Renderer Component
 * 
 * Core Three.js renderer for 3D avatars
 * 
 * License: Apache 2.0
 */

"use client";

import React, {
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AvatarRuntimeState } from "./avatarAssets";

const MIN_RENDER_SIZE = 320;

export interface AvatarRendererRef {
  playAnimation: (name: string) => void;
  setExpression: (expression: string) => void;
  setViseme: (viseme: number) => void;
  dispose: () => void;
}

interface AvatarRendererProps {
  modelUrl: string;
  avatarState?: AvatarRuntimeState;
  idleAnimationUrl?: string;
  thinkingAnimationUrl?: string;
  speakingAnimationUrl?: string;
  isSpeaking?: boolean;
  className?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

declare global {
  interface Window {
    __deepTutorAvatarDebug?: Record<string, unknown>;
  }
}

const AvatarRenderer = forwardRef<AvatarRendererRef, AvatarRendererProps>(
  (
    {
      modelUrl,
      avatarState,
      idleAnimationUrl,
      thinkingAnimationUrl,
      speakingAnimationUrl,
      isSpeaking = false,
      className = "",
      onLoad,
      onError,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const avatarRef = useRef<THREE.Object3D | null>(null);
    const morphTargetMeshRef = useRef<THREE.Mesh | null>(null);
    const animationMixerRef = useRef<THREE.AnimationMixer | null>(null);
    const animationActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
    const avatarModeActionsRef = useRef<{
      idle?: THREE.AnimationAction;
      thinking?: THREE.AnimationAction;
      speaking?: THREE.AnimationAction;
    }>({});
    const activeAvatarActionRef = useRef<THREE.AnimationAction | null>(null);
    const avatarBasePositionRef = useRef(new THREE.Vector3(0, 0, 0));
    const clockRef = useRef(new THREE.Clock());
    const frameIdRef = useRef<number>(0);
    const avatarStateRef = useRef<AvatarRuntimeState | undefined>(avatarState);
    const isSpeakingRef = useRef(isSpeaking);
    const onLoadRef = useRef(onLoad);
    const onErrorRef = useRef(onError);

    useEffect(() => {
      onLoadRef.current = onLoad;
      onErrorRef.current = onError;
    }, [onLoad, onError]);

    const reportError = (error: unknown) => {
      onErrorRef.current?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    };

    const playAvatarModeAction = useCallback(() => {
      const actions = avatarModeActionsRef.current;
      const explicitState = avatarStateRef.current;
      const nextAction =
        explicitState === "speaking" && actions.speaking
          ? actions.speaking
          : explicitState === "thinking" && actions.thinking
            ? actions.thinking
            : !explicitState && isSpeakingRef.current && actions.speaking
              ? actions.speaking
              : actions.idle;

      if (!nextAction || activeAvatarActionRef.current === nextAction) return;

      const previousAction = activeAvatarActionRef.current;
      nextAction.reset().fadeIn(0.25).play();
      previousAction?.fadeOut(0.25);
      activeAvatarActionRef.current = nextAction;
    }, []);

    useEffect(() => {
      avatarStateRef.current = avatarState;
      isSpeakingRef.current = isSpeaking;
      playAvatarModeAction();
    }, [avatarState, isSpeaking, playAvatarModeAction]);
    
    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      playAnimation: (name: string) => {
        const action = animationActionsRef.current[name];
        if (!action) return;
        
        action.reset().fadeIn(0.2).play();
      },
      
      setExpression: (expression: string) => {
        if (!morphTargetMeshRef.current) return;
        
        const influences = morphTargetMeshRef.current.morphTargetInfluences;
        const dictionary = morphTargetMeshRef.current.morphTargetDictionary;
        
        if (!influences || !dictionary) return;
        
        // Reset all expressions
        Object.values(dictionary).forEach((index) => {
          influences[index as number] = 0;
        });
        
        // Set new expression
        const targetIndex = dictionary[expression];
        if (targetIndex !== undefined) {
          influences[targetIndex] = 1.0;
        }
      },
      
      setViseme: (viseme: number) => {
        if (!morphTargetMeshRef.current) return;
        
        const influences = morphTargetMeshRef.current.morphTargetInfluences;
        if (!influences) return;
        
        // Simple mouth animation based on viseme index
        // viseme_AA, viseme_O, etc.
        const visemeNames = [
          "viseme_AA",
          "viseme_O",
          "viseme_E",
          "viseme_U",
          "viseme_AI",
          "viseme_Ch",
          "viseme_f",
        ];
        const visemeIndex = Math.min(viseme, visemeNames.length - 1);
        const targetName = visemeNames[visemeIndex];
        
        const dictionary = morphTargetMeshRef.current.morphTargetDictionary;
        if (dictionary && dictionary[targetName] !== undefined) {
          influences[dictionary[targetName]] = Math.sin(viseme * 0.5) * 0.5 + 0.5;
        }
      },
      
      dispose: () => {
        cancelAnimationFrame(frameIdRef.current);
        
        if (rendererRef.current && containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
          controlsRef.current?.dispose();
          controlsRef.current = null;
          rendererRef.current.dispose();
        }
        
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
      },
    }));
    
    useEffect(() => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      let resizeObserver: ResizeObserver | null = null;
      let renderer: THREE.WebGLRenderer | null = null;
      let disposed = false;

      const loadClip = async (loader: GLTFLoader, url?: string) => {
        if (!url) return null;
        const animationGltf = await loader.loadAsync(url);
        return animationGltf.animations[0] ?? null;
      };

      try {
        animationMixerRef.current = null;
        animationActionsRef.current = {};
        avatarModeActionsRef.current = {};
        activeAvatarActionRef.current = null;
        avatarRef.current = null;
        morphTargetMeshRef.current = null;

        container
          .querySelectorAll('canvas[data-avatar-canvas="true"]')
          .forEach((canvas) => canvas.remove());

        const width = Math.max(container.clientWidth, MIN_RENDER_SIZE);
        const height = Math.max(container.clientHeight, MIN_RENDER_SIZE);
      
        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        sceneRef.current = scene;
      
        // Camera
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(0, 1.0, 3.2);
        camera.lookAt(0, 0.9, 0);
        cameraRef.current = camera;
      
        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setClearColor(0x87ceeb, 1);
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.cursor = 'grab';
        renderer.domElement.dataset.avatarCanvas = 'true';
        renderer.shadowMap.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const canvas = renderer.domElement;
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.rotateSpeed = 0.55;
        controls.zoomSpeed = 0.65;
        controls.minDistance = 1.6;
        controls.maxDistance = 6;
        controls.minPolarAngle = THREE.MathUtils.degToRad(55);
        controls.maxPolarAngle = THREE.MathUtils.degToRad(96);
        controls.target.set(0, 0.95, 0);
        controls.update();
        canvas.addEventListener("pointerdown", () => {
          canvas.style.cursor = "grabbing";
        });
        canvas.addEventListener("pointerup", () => {
          canvas.style.cursor = "grab";
        });
        canvas.addEventListener("pointerleave", () => {
          canvas.style.cursor = "grab";
        });
        controlsRef.current = controls;
      
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
        scene.add(ambientLight);
      
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        scene.add(directionalLight);
      
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
        fillLight.position.set(-5, 5, -5);
        scene.add(fillLight);

        const ground = new THREE.Mesh(
          new THREE.CircleGeometry(2.2, 64),
          new THREE.MeshStandardMaterial({ color: 0xe8eef3, roughness: 0.85 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        scene.add(ground);
      
        // Load model
        const loader = new GLTFLoader();
        loader.load(
          modelUrl,
          async (gltf) => {
            try {
              if (disposed) return;
              const avatar = gltf.scene;
              const box = new THREE.Box3().setFromObject(avatar);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const scale = Math.min(1.2, 1.75 / maxDim);
              let meshCount = 0;

              avatar.scale.setScalar(scale);
              const basePosition = new THREE.Vector3(
                -center.x * scale,
                -box.min.y * scale,
                -center.z * scale,
              );
              avatar.position.copy(basePosition);
              avatarBasePositionRef.current.copy(basePosition);

              avatar.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  meshCount += 1;
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.frustumCulled = false;
                  child.visible = true;
                  child.renderOrder = 2;
                  const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                  materials.forEach((material) => {
                    material.side = THREE.DoubleSide;
                    const materialWithMap = material as THREE.Material & {
                      map?: THREE.Texture | null;
                    };
                    if (materialWithMap.map) {
                      materialWithMap.map.colorSpace = THREE.SRGBColorSpace;
                    }
                    material.needsUpdate = true;
                  });

                  // Check for morph targets (for facial expressions)
                  if (
                    child.morphTargetDictionary &&
                    Object.keys(child.morphTargetDictionary).length > 0
                  ) {
                    morphTargetMeshRef.current = child;
                  }
                }
              });

              // Setup animations
              if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(avatar);
                animationMixerRef.current = mixer;
                animationActionsRef.current = {};
                gltf.animations.forEach((clip) => {
                  animationActionsRef.current[clip.name] =
                    mixer.clipAction(clip);
                });
              }

              const mixer =
                animationMixerRef.current ?? new THREE.AnimationMixer(avatar);
              animationMixerRef.current = mixer;

              const [idleClip, thinkingClip, speakingClip] = await Promise.all([
                loadClip(loader, idleAnimationUrl),
                loadClip(loader, thinkingAnimationUrl),
                loadClip(loader, speakingAnimationUrl),
              ]);

              if (disposed) return;

              const createModeAction = (clip: THREE.AnimationClip | null) => {
                if (!clip) return undefined;
                const action = mixer.clipAction(clip, avatar);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.clampWhenFinished = false;
                action.enabled = true;
                return action;
              };

              const idleAction = createModeAction(idleClip);
              const thinkingAction = createModeAction(thinkingClip);
              const speakingAction = createModeAction(speakingClip);
              avatarModeActionsRef.current = {
                idle: idleAction,
                thinking: thinkingAction,
                speaking: speakingAction,
              };
              if (idleAction) animationActionsRef.current.idle = idleAction;
              if (thinkingAction) {
                animationActionsRef.current.thinking = thinkingAction;
              }
              if (speakingAction) {
                animationActionsRef.current.speaking = speakingAction;
              }

              scene.add(avatar);
              avatarRef.current = avatar;

              const framedBox = new THREE.Box3().setFromObject(avatar);
              const framedSize = framedBox.getSize(new THREE.Vector3());
              const framedCenter = framedBox.getCenter(new THREE.Vector3());
              const framedMaxDim =
                Math.max(framedSize.x, framedSize.y, framedSize.z) || 1;
              const frameDistance = Math.max(
                3,
                (framedMaxDim /
                  (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
                  1.25,
              );
              camera.position.set(
                framedCenter.x,
                framedCenter.y + framedSize.y * 0.08,
                framedCenter.z + frameDistance,
              );
              camera.lookAt(
                framedCenter.x,
                framedCenter.y + framedSize.y * 0.08,
                framedCenter.z,
              );
              controls.target.set(
                framedCenter.x,
                framedCenter.y + framedSize.y * 0.08,
                framedCenter.z,
              );
              controls.minDistance = Math.max(1.2, frameDistance * 0.45);
              controls.maxDistance = Math.max(4, frameDistance * 1.8);
              controls.update();
              camera.updateProjectionMatrix();
              window.__deepTutorAvatarDebug = {
                modelUrl,
                meshCount,
                originalBox: {
                  min: box.min.toArray(),
                  max: box.max.toArray(),
                  size: size.toArray(),
                  center: center.toArray(),
                },
                framedBox: {
                  min: framedBox.min.toArray(),
                  max: framedBox.max.toArray(),
                  size: framedSize.toArray(),
                  center: framedCenter.toArray(),
                },
                scale,
                cameraPosition: camera.position.toArray(),
                orbitControls: {
                  enabled: true,
                  minDistance: controls.minDistance,
                  maxDistance: controls.maxDistance,
                  target: controls.target.toArray(),
                },
                externalAnimations: {
                  idle: Boolean(idleClip),
                  thinking: Boolean(thinkingClip),
                  speaking: Boolean(speakingClip),
                },
                children: scene.children.length,
              };
              playAvatarModeAction();
              onLoadRef.current?.();
            } catch (error) {
              reportError(error);
            }
          },
          undefined,
          reportError,
        );
      
        // Animation loop
        const animate = () => {
          frameIdRef.current = requestAnimationFrame(animate);
        
          const delta = clockRef.current.getDelta();
        
          // Update animation mixer
          animationMixerRef.current?.update(delta);
          controlsRef.current?.update();
        
          // Subtle idle animation
          if (avatarRef.current) {
            avatarRef.current.position.y =
              avatarBasePositionRef.current.y +
              Math.sin(Date.now() * 0.001) * 0.005;
          }

          if (window.__deepTutorAvatarDebug) {
            const activeAction = activeAvatarActionRef.current;
            const head = avatarRef.current?.getObjectByName("Head");
            window.__deepTutorAvatarDebug.runtime = {
              mixerTime: animationMixerRef.current?.time ?? null,
              avatarState: avatarStateRef.current ?? null,
              actionClip: activeAction?.getClip().name ?? null,
              actionTime: activeAction?.time ?? null,
              actionWeight: activeAction?.getEffectiveWeight() ?? null,
              actionRunning: activeAction?.isRunning() ?? false,
              avatarY: avatarRef.current?.position.y ?? null,
              headQuaternion: head?.quaternion.toArray() ?? null,
              controlsTarget: controlsRef.current?.target.toArray() ?? null,
              cameraPosition: cameraRef.current?.position.toArray() ?? null,
            };
          }
        
          renderer?.render(scene, camera);
        };
        animate();
      
        // Resize handler
        const handleResize = () => {
          if (!container || !camera || !renderer) return;
          const w = Math.max(container.clientWidth, MIN_RENDER_SIZE);
          const h = Math.max(container.clientHeight, MIN_RENDER_SIZE);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);
        resizeObserver =
          typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(handleResize)
            : null;
        resizeObserver?.observe(container);

        return () => {
          disposed = true;
          window.removeEventListener('resize', handleResize);
          resizeObserver?.disconnect();
          cancelAnimationFrame(frameIdRef.current);
          
          if (renderer?.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
          controls.dispose();
          if (controlsRef.current === controls) controlsRef.current = null;
          renderer?.dispose();
          if (rendererRef.current === renderer) rendererRef.current = null;
        };
      } catch (error) {
        reportError(error);
      }
      
      return () => {
        disposed = true;
        resizeObserver?.disconnect();
        cancelAnimationFrame(frameIdRef.current);
        
        if (renderer?.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
        controlsRef.current?.dispose();
        controlsRef.current = null;
        renderer?.dispose();
        if (rendererRef.current === renderer) rendererRef.current = null;
      };
    }, [
      idleAnimationUrl,
      modelUrl,
      playAvatarModeAction,
      speakingAnimationUrl,
      thinkingAnimationUrl,
    ]);
    
    return (
      <div
        ref={containerRef}
        className={`w-full h-full ${className}`}
        style={{ minHeight: '300px' }}
      />
    );
  }
);

AvatarRenderer.displayName = 'AvatarRenderer';

export default AvatarRenderer;
