import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Video, X } from 'lucide-react';

interface CameraPhotoCaptureProps {
  idPrefix: string;
  photoDataUrl?: string;
  onChangePhoto: (nextDataUrl?: string) => void;
  label?: string;
}

function resizeImageToJpegDataUrl(
  source: HTMLImageElement | HTMLVideoElement,
  srcWidth: number,
  srcHeight: number
): string {
  const maxDim = 768;
  const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight, 1));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function CameraPhotoCapture({
  idPrefix,
  photoDataUrl,
  onChangePhoto,
  label = 'Item Photo (Camera or Upload)',
}: CameraPhotoCaptureProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleOpenCamera = async () => {
    setCameraError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'Live camera stream unavailable in this browser. Use "Upload / Camera File" to attach a photo.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera permission denied or no camera hardware detected.';
      setCameraError(
        `${msg}  --  you can still attach a photo via "Upload / Camera File".`
      );
    }
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const dataUrl = resizeImageToJpegDataUrl(video, video.videoWidth, video.videoHeight);
    if (dataUrl) {
      onChangePhoto(dataUrl);
      stopStream();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCameraError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const img = new Image();
      img.onload = () => {
        const resized = resizeImageToJpegDataUrl(img, img.naturalWidth, img.naturalHeight);
        onChangePhoto(resized || result);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (cameraActive ? stopStream() : void handleOpenCamera())}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Video className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            {cameraActive ? 'Close Camera' : 'Use Live Camera'}
          </button>

          <label
            htmlFor={`${idPrefix}-photo-file`}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ImagePlus className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            Upload / Camera File
            <input
              id={`${idPrefix}-photo-file`}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {cameraError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          {cameraError}
        </div>
      )}

      {cameraActive && (
        <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-950 p-2 dark:border-slate-700">
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-56 w-full rounded object-cover"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={stopStream}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCaptureFrame}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              Capture Snapshot
            </button>
          </div>
        </div>
      )}

      {photoDataUrl && (
        <div className="relative inline-flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
          <img
            src={photoDataUrl}
            alt="Captured item preview"
            className="h-20 w-24 rounded object-cover"
          />
          <div className="flex flex-col justify-between gap-2 py-0.5 text-xs">
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
              Photo attached for Gemini inspection
            </span>
            <button
              type="button"
              onClick={() => onChangePhoto(undefined)}
              className="inline-flex h-7 w-fit items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Remove Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
