/**
 * DeepTutor-Plus TTS Hook
 * 
 * React hook for Kokoro TTS integration
 * 
 * License: Apache 2.0
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface TTSOptions {
  modelId?: string;
  dtype?: 'fp16' | 'q8' | 'fp32' | 'q4' | 'q4f16';
  voice?: string;
}

interface UseTTSReturn {
  isInitialized: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  isPlaying: boolean;
  isSpeaking: boolean;
  audioCurrentTime: number;
  audioDuration: number;
  canSpeak: boolean;
  error: string | null;
  init: (options?: TTSOptions) => Promise<void>;
  speak: (text: string, voice?: string) => Promise<string | null>;
  speakAndWait: (text: string, voice?: string) => Promise<boolean>;
  stop: () => void;
  status: 'idle' | 'initializing' | 'ready' | 'error';
}

type WorkerStatus = 
  | 'init:start' 
  | 'init:complete' 
  | 'init:error'
  | 'generate:start'
  | 'generate:complete'
  | 'generate:error'
  | 'status:response';

interface WorkerMessage {
  status: WorkerStatus;
  type: string;
  error?: string;
  audioUrl?: string;
  initialized?: boolean;
}

export function useTTS(): UseTTSReturn {
  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const pendingGenerateRef = useRef<{
    resolve: (value: string | null) => void;
  } | null>(null);
  const pendingInitRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  const pendingPlaybackRef = useRef<{
    resolve: (value: boolean) => void;
  } | null>(null);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'initializing' | 'ready' | 'error'>('idle');

  const settlePlayback = useCallback((result: boolean) => {
    pendingPlaybackRef.current?.resolve(result);
    pendingPlaybackRef.current = null;
  }, []);

  const stopCurrentAudio = useCallback((settle = false) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.load();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    if (settle) settlePlayback(false);
  }, [settlePlayback]);

  const playAudioUrl = useCallback((audioUrl: string): Promise<boolean> => {
    stopCurrentAudio(true);
    return new Promise((resolve) => {
      pendingPlaybackRef.current = { resolve };
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;

      audio.onloadedmetadata = () => {
        setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.ontimeupdate = () => {
        setAudioCurrentTime(audio.currentTime);
      };
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => {
        setIsPlaying(false);
        setAudioCurrentTime(0);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        settlePlayback(true);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setError('Failed to play audio');
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        settlePlayback(false);
      };

      audio.play().catch((err: Error) => {
        setError(`Playback error: ${err.message}`);
        setIsPlaying(false);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        settlePlayback(false);
      });
    });
  }, [settlePlayback, stopCurrentAudio]);
  
  // Initialize worker
  useEffect(() => {
    // Create worker from the kokoro worker file
    workerRef.current = new Worker(
      new URL('../workers/kokoro.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { status: workerStatus, error, audioUrl } = event.data;
      
      switch (workerStatus) {
        case 'init:start':
          setStatus('initializing');
          setIsLoading(true);
          break;
          
        case 'init:complete':
          setStatus('ready');
          setIsInitialized(true);
          setIsLoading(false);
          pendingInitRef.current?.resolve();
          pendingInitRef.current = null;
          break;
          
        case 'init:error':
          setStatus('error');
          setError(error || 'Failed to initialize TTS');
          setIsLoading(false);
          pendingInitRef.current?.reject(
            new Error(error || 'Failed to initialize TTS'),
          );
          pendingInitRef.current = null;
          break;
          
        case 'generate:complete':
          setIsGenerating(false);
          pendingGenerateRef.current?.resolve(audioUrl || null);
          pendingGenerateRef.current = null;
          if (audioUrl) {
            void playAudioUrl(audioUrl);
          }
          break;
          
        case 'generate:start':
          setIsGenerating(true);
          setError(null);
          break;

        case 'generate:error':
          setError(error || 'Failed to generate speech');
          setIsGenerating(false);
          pendingGenerateRef.current?.resolve(null);
          pendingGenerateRef.current = null;
          break;
      }
    };
    
    workerRef.current.onerror = (err) => {
      setError(`Worker error: ${err.message}`);
      setStatus('error');
      setIsLoading(false);
    };
    
    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      stopCurrentAudio(true);
      pendingGenerateRef.current?.resolve(null);
      pendingGenerateRef.current = null;
      pendingInitRef.current?.reject(new Error('TTS worker terminated'));
      pendingInitRef.current = null;
    };
  }, [playAudioUrl, stopCurrentAudio]);
  
  const init = useCallback(async (options?: TTSOptions) => {
    if (!workerRef.current || isInitialized) return;
    
    setIsLoading(true);
    setError(null);

    const pending = new Promise<void>((resolve, reject) => {
      pendingInitRef.current = { resolve, reject };
    });

    workerRef.current.postMessage({
      type: 'init',
      payload: {
        model_id: options?.modelId,
        dtype: options?.dtype,
      },
    });

    await pending;
  }, [isInitialized]);
  
  const speak = useCallback(async (text: string, voice?: string): Promise<string | null> => {
    if (!workerRef.current || !isInitialized) {
      setError('TTS not initialized');
      return null;
    }
    
    const trimmed = text.trim();
    if (!trimmed) return null;

    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve(null);
        return;
      }

      pendingGenerateRef.current?.resolve(null);
      pendingGenerateRef.current = { resolve };
      setIsGenerating(true);
      setError(null);
      workerRef.current.postMessage({
        type: 'generate',
        payload: { text: trimmed, voice },
      });
    });
  }, [isInitialized]);

  const speakAndWait = useCallback(async (text: string, voice?: string) => {
    const audioUrl = await speak(text, voice);
    if (!audioUrl) return false;
    if (!audioRef.current && pendingPlaybackRef.current) {
      return new Promise<boolean>((resolve) => {
        const existingResolve = pendingPlaybackRef.current?.resolve;
        pendingPlaybackRef.current = {
          resolve: (value) => {
            existingResolve?.(value);
            resolve(value);
          },
        };
      });
    }
    return new Promise<boolean>((resolve) => {
      const existingResolve = pendingPlaybackRef.current?.resolve;
      pendingPlaybackRef.current = {
        resolve: (value) => {
          existingResolve?.(value);
          resolve(value);
        },
      };
    });
  }, [speak]);
  
  const stop = useCallback(() => {
    stopCurrentAudio(true);
  }, [stopCurrentAudio]);

  const canSpeak = isInitialized && !isLoading && !isGenerating;
  
  return {
    isInitialized,
    isLoading,
    isGenerating,
    isPlaying,
    isSpeaking: isPlaying,
    audioCurrentTime,
    audioDuration,
    canSpeak,
    error,
    init,
    speak,
    speakAndWait,
    stop,
    status,
  };
}
