/**
 * DeepTutor-Plus Kokoro TTS Web Worker
 * 
 * Web Worker for Kokoro TTS synthesis
 * Ported from Open-TutorAi's implementation
 * 
 * Features:
 * - Browser-side TTS synthesis
 * - WebGPU acceleration (with WASM fallback)
 * - Multiple voice support
 * 
 * License: Apache 2.0
 */

// Types for worker messages
interface InitPayload {
  model_id?: string;
  dtype?: 'fp16' | 'q8' | 'fp32' | 'q4' | 'q4f16';
}

interface GeneratePayload {
  text: string;
  voice?: string;
}

type WorkerMessageType = 'init' | 'generate' | 'status';
type WorkerStatus = 
  | 'init:start' 
  | 'init:complete' 
  | 'init:error'
  | 'generate:start'
  | 'generate:complete'
  | 'generate:error'
  | 'status:check'
  | 'status:response';

interface WorkerMessage {
  type: WorkerMessageType;
  payload?: InitPayload | GeneratePayload;
  status?: WorkerStatus;
  error?: string;
  audioUrl?: string;
  initialized?: boolean;
}

// Default model - Kokoro 82M
const DEFAULT_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let tts: any = null;
let isInitialized = false;

// Check for WebGPU support
function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// Initialize TTS model
async function initModel(modelId?: string, dtype?: InitPayload['dtype']) {
  const actualModelId = modelId || DEFAULT_MODEL_ID;
  
  self.postMessage({
    status: 'init:start',
    type: 'init'
  } as WorkerMessage);

  try {
    // Dynamic import of kokoro-js (will be loaded via CDN or bundled)
    // In production, this would use the actual KokoroTTS library
    const { KokoroTTS } = await import('kokoro-js');
    
    tts = await KokoroTTS.from_pretrained(actualModelId, {
      dtype: dtype || (hasWebGPU() ? 'fp16' : 'fp32'),
      device: hasWebGPU() ? 'webgpu' : 'wasm',
    });
    
    isInitialized = true;
    
    self.postMessage({
      status: 'init:complete',
      type: 'init'
    } as WorkerMessage);
  } catch (error: any) {
    isInitialized = false;
    self.postMessage({
      status: 'init:error',
      error: error.message,
      type: 'init'
    } as WorkerMessage);
  }
}

// Generate speech
async function generateSpeech(text: string, voice?: string) {
  if (!isInitialized || !tts) {
    self.postMessage({
      status: 'generate:error',
      error: 'TTS model not initialized',
      type: 'generate'
    } as WorkerMessage);
    return;
  }

  self.postMessage({
    status: 'generate:start',
    type: 'generate'
  } as WorkerMessage);

  try {
    const rawAudio = await tts.generate(text, { 
      voice: voice || 'default' 
    });
    
    // Convert to blob
    const arrayBuffer = await rawAudio.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const blobUrl = URL.createObjectURL(blob);
    
    self.postMessage({
      status: 'generate:complete',
      audioUrl: blobUrl,
      type: 'generate'
    } as WorkerMessage);
  } catch (error: any) {
    self.postMessage({
      status: 'generate:error',
      error: error.message,
      type: 'generate'
    } as WorkerMessage);
  }
}

// Handle status check
function handleStatus() {
  self.postMessage({
    status: 'status:response',
    initialized: isInitialized,
    type: 'status'
  } as WorkerMessage);
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'init':
      const initPayload = payload as InitPayload;
      await initModel(initPayload?.model_id, initPayload?.dtype);
      break;
      
    case 'generate':
      const generatePayload = payload as GeneratePayload;
      await generateSpeech(generatePayload?.text, generatePayload?.voice);
      break;
      
    case 'status':
      handleStatus();
      break;
  }
};

// Export for TypeScript
export {};
