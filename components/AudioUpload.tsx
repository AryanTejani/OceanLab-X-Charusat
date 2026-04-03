'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const AudioUpload = ({ onClose }: { onClose?: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const acceptedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];

  const handleFile = (f: File) => {
    if (!acceptedTypes.includes(f.type) && !f.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
      setError('Please upload an audio file (MP3, WAV, M4A, WebM)');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File size must be under 100MB');
      return;
    }
    setFile(f);
    setError(null);
    if (!title) {
      setTitle(f.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', title || file.name);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      onClose?.();
      router.push(`/meeting-insights/${data.meetingId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-1 bg-blue-1/10'
            : file
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-dark-4 hover:border-gray-500'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <div>
            <div className="size-12 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </div>
            <p className="text-white font-medium">{file.name}</p>
            <p className="text-gray-400 text-sm mt-1">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            <p className="text-blue-1 text-xs mt-2">Click to change file</p>
          </div>
        ) : (
          <div>
            <div className="size-12 mx-auto mb-2 rounded-full bg-dark-3 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5E6680" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-white font-medium">Drop audio file here or click to browse</p>
            <p className="text-gray-400 text-sm mt-1">MP3, WAV, M4A, WebM (max 100MB)</p>
          </div>
        )}
      </div>

      {/* Title input */}
      <input
        type="text"
        placeholder="Meeting title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-4 py-2 rounded-lg bg-dark-3 border border-dark-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-1"
      />

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full px-4 py-3 bg-blue-1 text-white font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Uploading & Transcribing...' : 'Upload & Analyze'}
      </button>
    </div>
  );
};

export default AudioUpload;
