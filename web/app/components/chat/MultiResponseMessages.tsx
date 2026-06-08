/**
 * DeepTutor-Plus Multi-Response Messages Component
 * 
 * React port of Open-TutorAi's MultiResponseMessages.svelte
 * Displays responses from multiple models in MoA (Mixture of Agents) mode
 * 
 * License: Apache 2.0
 */

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

interface ModelResponse {
  id: string;
  model: string;
  content: string;
  timestamp: Date;
  status: 'loading' | 'complete' | 'error';
  error?: string;
}

interface MultiResponseMessagesProps {
  responses: ModelResponse[];
  onResponseSelect?: (response: ModelResponse) => void;
  onMergeRequest?: () => void;
  showMergeButton?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

// Model colors for visual distinction
const MODEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'gpt-4o': { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-700' },
  'gpt-4o-mini': { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-600' },
  'claude-3-opus': { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700' },
  'claude-3-sonnet': { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-600' },
  'gemini-1.5-pro': { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700' },
  'gemini-1.5-flash': { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-600' },
  'default': { bg: 'bg-gray-50', border: 'border-gray-500', text: 'text-gray-700' },
};

function getModelColor(modelName: string) {
  const lower = modelName.toLowerCase();
  for (const [key, colors] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key.replace(/-/g, ''))) {
      return colors;
    }
  }
  return MODEL_COLORS.default;
}

function getModelIcon(modelName: string) {
  const lower = modelName.toLowerCase();
  if (lower.includes('gpt') || lower.includes('openai')) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zm3.974-14.351l-1.88.924a2.47 2.47 0 0 0-1.21.338l-.142-.082-2.783-1.708a.419.419 0 0 1-.015-.685l4.788-2.808.021.009a3.33 3.33 0 0 1 3.036.034 2.47 2.47 0 0 1 1.211 2.846l-.048.02-4.796 2.917a.42.42 0 0 1-.552-.13l-.018-.01-2.89-1.698a.42.42 0 0 1-.167-.52l.039-.018 3.16-1.869.025.012a3.33 3.33 0 0 1 2.39 1.8 2.47 2.47 0 0 1-.368 2.237l.024.012z"/>
      </svg>
    );
  }
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    );
  }
  if (lower.includes('gemini') || lower.includes('google')) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>
  );
}

export default function MultiResponseMessages({
  responses,
  onResponseSelect,
  onMergeRequest,
  showMergeButton = true,
  className = '',
  defaultExpanded = false,
}: MultiResponseMessagesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const initialExpandedIds = useMemo(
    () => new Set(defaultExpanded ? responses.map((r) => r.id) : []),
    [defaultExpanded, responses],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpandedIds);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new responses arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responses]);
  
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const handleSelect = (response: ModelResponse) => {
    setSelectedId(response.id);
    onResponseSelect?.(response);
  };
  
  const loadingCount = responses.filter(r => r.status === 'loading').length;
  const completeCount = responses.filter(r => r.status === 'complete').length;
  const errorCount = responses.filter(r => r.status === 'error').length;
  
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-700">Multi-Model Responses</span>
          <div className="flex gap-2">
            {loadingCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                {loadingCount} loading
              </span>
            )}
            {completeCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                {completeCount} complete
              </span>
            )}
            {errorCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {errorCount} error
              </span>
            )}
          </div>
        </div>
        
        {showMergeButton && onMergeRequest && (
          <button
            onClick={onMergeRequest}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Merge Responses
          </button>
        )}
      </div>
      
      {/* Responses list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {responses.map((response) => {
          const colors = getModelColor(response.model);
          const isExpanded = expandedIds.has(response.id);
          const isSelected = selectedId === response.id;
          
          return (
            <div
              key={response.id}
              className={`
                border rounded-lg overflow-hidden transition-all
                ${colors.border}
                ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                ${response.status === 'loading' ? 'opacity-75' : ''}
              `}
            >
              {/* Response header */}
              <div 
                className={`flex items-center justify-between px-4 py-3 cursor-pointer ${colors.bg}`}
                onClick={() => toggleExpand(response.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={colors.text}>{getModelIcon(response.model)}</span>
                  <span className="font-medium">{response.model}</span>
                  {response.status === 'loading' && (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {response.status === 'error' && (
                    <span className="text-xs text-red-600">Error</span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {response.timestamp.toLocaleTimeString()}
                  </span>
                  <svg 
                    className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {/* Response content */}
              {isExpanded && (
                <div className="p-4 bg-white">
                  {response.status === 'error' ? (
                    <p className="text-red-600">{response.error}</p>
                  ) : response.status === 'loading' ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Generating response...</span>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap">{response.content}</div>
                    </div>
                  )}
                  
                  {/* Select button */}
                  <div className="mt-4 pt-3 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(response);
                      }}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${isSelected 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                      `}
                    >
                      {isSelected ? 'Selected' : 'Use this response'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
