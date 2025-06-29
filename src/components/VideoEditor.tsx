import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import ZoomControls from './ZoomControls';
import Timeline from './Timeline';

interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  position: { x: number; y: number };
  name: string;
}

const VideoEditor = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [videoFile, setVideoFile] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [trimSegments, setTrimSegments] = useState<{start: number, end: number}[]>([]);
  const [cutPoints, setCutPoints] = useState<number[]>([]);
  const [ffmpeg, setFfmpeg] = useState<any>(null);
  const [isFFmpegLoading, setIsFFmpegLoading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get current active zoom effect with smooth interpolation
  const getCurrentZoomEffect = () => {
    const activeEffect = zoomEffects.find(effect => 
      currentTime >= effect.startTime && currentTime <= effect.endTime
    );
    
    if (!activeEffect) return null;
    
    // Check for smooth transitions between effects
    const nextEffect = zoomEffects.find(effect => 
      Math.abs(effect.startTime - activeEffect.endTime) < 0.1 && effect.id !== activeEffect.id
    );
    
    if (nextEffect && currentTime > activeEffect.endTime - 1) {
      // Interpolate between current and next effect for smooth transition
      const progress = Math.max(0, Math.min(1, (currentTime - (activeEffect.endTime - 1)) / 1));
      return {
        ...activeEffect,
        zoomLevel: activeEffect.zoomLevel + (nextEffect.zoomLevel - activeEffect.zoomLevel) * progress,
        position: {
          x: activeEffect.position.x + (nextEffect.position.x - activeEffect.position.x) * progress,
          y: activeEffect.position.y + (nextEffect.position.y - activeEffect.position.y) * progress
        }
      };
    }
    
    return activeEffect;
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      videoRef.current.addEventListener('ended', () => setIsPlaying(false));
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [videoFile]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
      const newVolume = value[0];
      videoRef.current.volume = newVolume / 100;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        videoRef.current.volume = volume / 100;
        setIsMuted(false);
      } else {
        videoRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const handleFullscreen = () => {
    if (previewContainerRef.current) {
      if (previewContainerRef.current.requestFullscreen) {
        previewContainerRef.current.requestFullscreen();
      } else if ((previewContainerRef.current as any).webkitRequestFullscreen) {
        (previewContainerRef.current as any).webkitRequestFullscreen();
      } else if ((previewContainerRef.current as any).msRequestFullscreen) {
        (previewContainerRef.current as any).msRequestFullscreen();
      }
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoFile(url);
      setVideoFileName(file.name);
      setCurrentTime(0);
      setIsPlaying(false);
      setZoomEffects([]);
      setSelectedZoomId(null);
      setTrimSegments([]);
      setCutPoints([]);
    }
  };

  const handleAddZoomEffect = () => {
    const newZoomEffect: ZoomEffect = {
      id: `zoom_${Date.now()}`,
      startTime: currentTime,
      endTime: Math.min(currentTime + 5, duration),
      zoomLevel: 150,
      position: { x: 50, y: 50 },
      name: `Zoom ${zoomEffects.length + 1}`
    };
    setZoomEffects(prev => [...prev, newZoomEffect]);
    setSelectedZoomId(newZoomEffect.id);
  };

  const handleUpdateZoomEffect = (id: string, updates: Partial<ZoomEffect>) => {
    setZoomEffects(prev => prev.map(effect => 
      effect.id === id ? { ...effect, ...updates } : effect
    ));
  };

  const handleDeleteZoomEffect = (id: string) => {
    setZoomEffects(prev => prev.filter(effect => effect.id !== id));
    if (selectedZoomId === id) {
      setSelectedZoomId(null);
    }
  };

  const handleTrim = (startTime: number, endTime: number) => {
    console.log(`Trimming video from ${startTime}s to ${endTime}s`);
    setTrimSegments(prev => [...prev, { start: startTime, end: endTime }]);
  };

  const handleCut = (cutTime: number) => {
    console.log(`Cutting video at ${cutTime}s`);
    setCutPoints(prev => [...prev, cutTime]);
  };

  // Canvas-based video processing for zoom effects
  const processVideoWithCanvas = async (videoBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      
      video.src = URL.createObjectURL(videoBlob);
      video.crossOrigin = 'anonymous';
      
      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const chunks: Blob[] = [];
        const stream = canvas.captureStream(30); // 30 FPS
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9'
        });
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          const processedBlob = new Blob(chunks, { type: 'video/webm' });
          resolve(processedBlob);
        };
        
        recorder.start();
        video.play();
        
        const processFrame = () => {
          if (video.ended) {
            recorder.stop();
            return;
          }
          
          const currentZoom = getCurrentZoomForTime(video.currentTime);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (currentZoom) {
            const scale = currentZoom.zoomLevel / 100;
            const centerX = (currentZoom.position.x / 100) * video.videoWidth;
            const centerY = (currentZoom.position.y / 100) * video.videoHeight;
            
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(scale, scale);
            ctx.translate(-centerX, -centerY);
            ctx.drawImage(video, 0, 0);
            ctx.restore();
          } else {
            ctx.drawImage(video, 0, 0);
          }
          
          requestAnimationFrame(processFrame);
        };
        
        processFrame();
      };
      
      video.onerror = reject;
    });
  };

  const getCurrentZoomForTime = (time: number) => {
    return zoomEffects.find(effect => 
      time >= effect.startTime && time <= effect.endTime
    );
  };

  // Load FFmpeg with proper error handling
  const loadFFmpeg = async () => {
    if (ffmpeg) return ffmpeg;
    
    setIsFFmpegLoading(true);
    setExportStatus('Loading video processor...');
    
    try {
      // Use dynamic import with proper error handling
      const ffmpegModule = await import('@ffmpeg/ffmpeg');
      const utilModule = await import('@ffmpeg/util');
      
      const { FFmpeg } = ffmpegModule;
      const { fetchFile, toBlobURL } = utilModule;
      
      const ffmpegInstance = new FFmpeg();
      
      // Use a more reliable CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await ffmpegInstance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setFfmpeg(ffmpegInstance);
      setIsFFmpegLoading(false);
      return ffmpegInstance;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      setIsFFmpegLoading(false);
      
      // Fallback to canvas-based processing
      alert('FFmpeg failed to load. Using canvas-based processing (may be slower).');
      return null;
    }
  };

  // Enhanced export with fallback to canvas processing
  const handleExport = async () => {
    if (!videoRef.current || !videoFile) {
      alert('Please import a video first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Starting export...');

    try {
      // Get video file as blob
      const response = await fetch(videoFile);
      const videoBlob = await response.blob();
      
      // Try FFmpeg first, fallback to canvas if it fails
      let ffmpegInstance;
      try {
        ffmpegInstance = await loadFFmpeg();
      } catch (error) {
        console.warn('FFmpeg unavailable, using canvas fallback');
        ffmpegInstance = null;
      }
      
      if (ffmpegInstance && zoomEffects.length > 0) {
        // Use FFmpeg for complex processing
        await exportWithFFmpeg(ffmpegInstance, videoBlob);
      } else if (zoomEffects.length > 0) {
        // Use canvas for zoom effects when FFmpeg is unavailable
        await exportWithCanvas(videoBlob);
      } else {
        // Simple export without effects
        await exportSimple(videoBlob);
      }
      
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message || 'Unknown error occurred'}`);
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }
  };

  const exportWithFFmpeg = async (ffmpegInstance: any, videoBlob: Blob) => {
    const { fetchFile } = await import('@ffmpeg/util');
    
    setExportStatus('Preparing video file...');
    setExportProgress(10);
    
    const inputFileName = 'input.mp4';
    const outputFileName = 'output.mp4';
    
    // Write input file
    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoBlob));
    
    setExportStatus('Building filter chain...');
    setExportProgress(20);
    
    let ffmpegArgs = ['-i', inputFileName];
    
    // Handle trim segments
    if (trimSegments.length > 0) {
      const { start, end } = trimSegments[0];
      ffmpegArgs.push('-ss', start.toString(), '-to', end.toString());
    }
    
    // Build zoom filter
    const zoomFilter = buildZoomFilter();
    
    if (zoomFilter) {
      setExportStatus('Applying zoom effects...');
      setExportProgress(30);
      
      ffmpegArgs.push('-filter_complex', zoomFilter);
      ffmpegArgs.push('-map', '[outv]');
      ffmpegArgs.push('-map', '0:a?'); // Include audio
    } else {
      ffmpegArgs.push('-c:v', 'libx264');
      ffmpegArgs.push('-c:a', 'aac');
    }
    
    // High quality output settings
    ffmpegArgs.push(
      '-preset', 'medium',
      '-crf', '23',
      '-movflags', '+faststart',
      '-y',
      outputFileName
    );
    
    setExportStatus('Processing video...');
    setExportProgress(40);
    
    // Set up progress monitoring
    ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
      const adjustedProgress = 40 + (progress * 50);
      setExportProgress(Math.min(adjustedProgress, 90));
      setExportStatus(`Processing... ${Math.round(adjustedProgress)}%`);
    });
    
    // Run FFmpeg
    await ffmpegInstance.exec(ffmpegArgs);
    
    setExportStatus('Finalizing export...');
    setExportProgress(95);
    
    // Read and download output
    const outputData = await ffmpegInstance.readFile(outputFileName);
    const outputBlob = new Blob([outputData], { type: 'video/mp4' });
    downloadVideo(outputBlob, 'mp4');
    
    // Clean up
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);
    
    completeExport();
  };

  const exportWithCanvas = async (videoBlob: Blob) => {
    setExportStatus('Processing with canvas...');
    setExportProgress(30);
    
    const processedBlob = await processVideoWithCanvas(videoBlob);
    
    setExportStatus('Converting to MP4...');
    setExportProgress(80);
    
    // Try to convert WebM to MP4 if FFmpeg is available
    try {
      const ffmpegInstance = await loadFFmpeg();
      if (ffmpegInstance) {
        const { fetchFile } = await import('@ffmpeg/util');
        
        await ffmpegInstance.writeFile('input.webm', await fetchFile(processedBlob));
        await ffmpegInstance.exec([
          '-i', 'input.webm',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart',
          '-y', 'output.mp4'
        ]);
        
        const outputData = await ffmpegInstance.readFile('output.mp4');
        const outputBlob = new Blob([outputData], { type: 'video/mp4' });
        downloadVideo(outputBlob, 'mp4');
        
        await ffmpegInstance.deleteFile('input.webm');
        await ffmpegInstance.deleteFile('output.mp4');
      } else {
        // Download as WebM if MP4 conversion fails
        downloadVideo(processedBlob, 'webm');
      }
    } catch (error) {
      console.warn('MP4 conversion failed, downloading as WebM');
      downloadVideo(processedBlob, 'webm');
    }
    
    completeExport();
  };

  const exportSimple = async (videoBlob: Blob) => {
    setExportStatus('Preparing simple export...');
    setExportProgress(50);
    
    if (trimSegments.length > 0) {
      // Apply trim using FFmpeg if available
      try {
        const ffmpegInstance = await loadFFmpeg();
        if (ffmpegInstance) {
          const { fetchFile } = await import('@ffmpeg/util');
          
          await ffmpegInstance.writeFile('input.mp4', await fetchFile(videoBlob));
          
          const { start, end } = trimSegments[0];
          await ffmpegInstance.exec([
            '-i', 'input.mp4',
            '-ss', start.toString(),
            '-to', end.toString(),
            '-c', 'copy',
            '-y', 'output.mp4'
          ]);
          
          const outputData = await ffmpegInstance.readFile('output.mp4');
          const outputBlob = new Blob([outputData], { type: 'video/mp4' });
          downloadVideo(outputBlob, 'mp4');
          
          await ffmpegInstance.deleteFile('input.mp4');
          await ffmpegInstance.deleteFile('output.mp4');
        } else {
          downloadVideo(videoBlob, 'mp4');
        }
      } catch (error) {
        downloadVideo(videoBlob, 'mp4');
      }
    } else {
      downloadVideo(videoBlob, 'mp4');
    }
    
    completeExport();
  };

  const downloadVideo = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${videoFileName.replace(/\.[^/.]+$/, '')}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completeExport = () => {
    setExportProgress(100);
    setExportStatus('Export completed!');
    
    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }, 2000);
  };

  // Build complex filter for zoom effects
  const buildZoomFilter = () => {
    if (zoomEffects.length === 0) return '';
    
    const sortedEffects = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
    
    let filterParts = [];
    let concatInputs = [];
    
    for (let i = 0; i < sortedEffects.length; i++) {
      const effect = sortedEffects[i];
      const nextEffect = sortedEffects[i + 1];
      
      const segmentEnd = nextEffect ? nextEffect.startTime : effect.endTime;
      const segmentDuration = segmentEnd - effect.startTime;
      
      if (segmentDuration <= 0) continue;
      
      const zoomStart = effect.zoomLevel / 100;
      const zoomEnd = nextEffect ? nextEffect.zoomLevel / 100 : zoomStart;
      const posXStart = effect.position.x;
      const posXEnd = nextEffect ? nextEffect.position.x : posXStart;
      const posYStart = effect.position.y;
      const posYEnd = nextEffect ? nextEffect.position.y : posYStart;
      
      const timeVar = `(t-${effect.startTime})`;
      const progress = segmentDuration > 0 ? `min(1,max(0,${timeVar}/${segmentDuration}))` : '0';
      
      const zoomExpr = zoomStart === zoomEnd ? 
        `${zoomStart}` : 
        `${zoomStart}+(${zoomEnd}-${zoomStart})*${progress}`;
      
      const posXExpr = posXStart === posXEnd ? 
        `${posXStart}` : 
        `${posXStart}+(${posXEnd}-${posXStart})*${progress}`;
      
      const posYExpr = posYStart === posYEnd ? 
        `${posYStart}` : 
        `${posYStart}+(${posYEnd}-${posYStart})*${progress}`;
      
      const outW = `iw/(${zoomExpr})`;
      const outH = `ih/(${zoomExpr})`;
      const xExpr = `(iw-${outW})*(${posXExpr})/100`;
      const yExpr = `(ih-${outH})*(${posYExpr})/100`;
      
      filterParts.push(
        `[0:v]trim=start=${effect.startTime}:end=${segmentEnd},setpts=PTS-STARTPTS,crop=${outW}:${outH}:${xExpr}:${yExpr},scale=iw:ih[v${i}]`
      );
      concatInputs.push(`[v${i}]`);
    }
    
    if (concatInputs.length > 1) {
      filterParts.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[outv]`);
    } else if (concatInputs.length === 1) {
      filterParts.push(`[v0]copy[outv]`);
    }
    
    return filterParts.join(';');
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentZoom = getCurrentZoomEffect();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-700 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Professional Video Editor</h1>
          {videoFileName && (
            <p className="text-sm text-gray-400 mt-1">Editing: {videoFileName}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="bg-gray-800 border-gray-600 hover:bg-gray-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import Video
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!videoFile || isExporting || isFFmpegLoading}
            className="bg-green-600 border-green-500 hover:bg-green-700"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? `${Math.round(exportProgress)}%` : isFFmpegLoading ? 'Loading...' : 'Export Video'}
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Zoom Controls */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
          <ZoomControls
            zoomEffects={zoomEffects}
            selectedZoomId={selectedZoomId}
            onSelectZoom={setSelectedZoomId}
            onAddZoom={handleAddZoomEffect}
            onUpdateZoom={handleUpdateZoomEffect}
            onDeleteZoom={handleDeleteZoomEffect}
            currentTime={currentTime}
            duration={duration}
          />
          
          {/* Video Info */}
          {videoFile && (
            <Card className="m-4 p-4 bg-gray-700 border-gray-600">
              <h4 className="text-sm font-medium mb-2 text-white">Video Info</h4>
              <div className="text-xs text-gray-300 space-y-1">
                <div>Duration: {formatTime(duration)}</div>
                <div>Current: {formatTime(currentTime)}</div>
                <div>Volume: {isMuted ? 'Muted' : `${volume}%`}</div>
                <div>Zoom Effects: {zoomEffects.length}</div>
                <div>Cut Points: {cutPoints.length}</div>
                <div>Trim Segments: {trimSegments.length}</div>
                {currentZoom && (
                  <div className="text-purple-300">
                    Active Zoom: {currentZoom.zoomLevel.toFixed(0)}%
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Export Progress */}
          {(isExporting || isFFmpegLoading) && (
            <Card className="m-4 p-4 bg-gray-700 border-gray-600">
              <h4 className="text-sm font-medium mb-2 text-white">
                {isFFmpegLoading ? 'Loading Processor' : 'Export Progress'}
              </h4>
              <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-300">{Math.round(exportProgress)}% Complete</div>
              {exportStatus && (
                <div className="text-xs text-green-300 mt-1">{exportStatus}</div>
              )}
            </Card>
          )}

          {/* Export Features */}
          {videoFile && (
            <Card className="m-4 p-3 bg-green-900/30 border-green-600">
              <h4 className="text-xs font-medium mb-2 text-green-300">Export Features</h4>
              <div className="text-xs text-green-200 space-y-1">
                <div>✓ MP4/WebM Output</div>
                <div>✓ Audio Preservation</div>
                <div>✓ Smooth Zoom Effects</div>
                <div>✓ Canvas Fallback</div>
                <div>✓ High Quality Encoding</div>
                <div>✓ Fast Export</div>
                {zoomEffects.length > 0 && (
                  <div>✓ {zoomEffects.length} Zoom Effect{zoomEffects.length > 1 ? 's' : ''}</div>
                )}
                {trimSegments.length > 0 && (
                  <div>✓ Trimmed: {formatTime(trimSegments[0].start)} - {formatTime(trimSegments[0].end)}</div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Video Preview Area */}
          <div
            ref={previewContainerRef}
            className="flex-1 bg-black relative flex items-center justify-center overflow-hidden w-full h-full"
            style={{ minHeight: 0 }}
          >
            {videoFile ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoFile}
                  className="w-full h-full object-contain"
                  style={{
                    transform: currentZoom 
                      ? `scale(${currentZoom.zoomLevel / 100})`
                      : 'none',
                    transformOrigin: currentZoom 
                      ? `${currentZoom.position.x}% ${currentZoom.position.y}%`
                      : 'center center',
                    transition: 'all 0.3s ease'
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  crossOrigin="anonymous"
                />
                
                {/* Zoom indicator */}
                {currentZoom && (
                  <div className="absolute top-4 left-4 bg-purple-600/80 text-white px-2 py-1 rounded text-sm">
                    Zoom: {currentZoom.zoomLevel.toFixed(0)}%
                  </div>
                )}
                
                {/* Processing overlay */}
                {(isExporting || isFFmpegLoading) && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-lg mb-1">
                        {isFFmpegLoading ? 'Loading Processor...' : `Exporting ${Math.round(exportProgress)}%`}
                      </p>
                      {exportStatus && (
                        <p className="text-sm text-gray-300">{exportStatus}</p>
                      )}
                      <p className="text-xs text-green-300 mt-2">
                        {isFFmpegLoading ? 'Preparing video processor...' : 'Creating video with audio'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 w-full h-full flex flex-col items-center justify-center">
                <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Import a video file to start editing</p>
                <p className="text-sm text-gray-500 mb-4">Professional video export with audio</p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Choose Video File
                </Button>
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSeek([Math.max(0, currentTime - 10)])}
                disabled={!videoFile}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePlayPause}
                disabled={!videoFile}
                className="bg-green-600 hover:bg-green-700"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSeek([Math.min(duration, currentTime + 10)])}
                disabled={!videoFile}
              >
                <SkipForward className="w-4 h-4" />
              </Button>

              <div className="text-sm text-gray-400 ml-4">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={toggleMute} disabled={!videoFile}>
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-20"
                  disabled={!videoFile}
                />
                <Button variant="ghost" size="sm" onClick={handleFullscreen} disabled={!videoFile}>
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          {videoFile && (
            <Timeline
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              onTrim={handleTrim}
              onCut={handleCut}
              zoomEffects={zoomEffects}
              cutPoints={cutPoints}
              trimSegments={trimSegments}
            />
          )}
        </div>
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileImport}
        className="hidden"
      />
    </div>
  );
};

export default VideoEditor;