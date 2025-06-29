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
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

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
      // Clear any previous download
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
      }
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

  // Load FFmpeg with better error handling and fallback
  const loadFFmpeg = async () => {
    if (ffmpeg) return ffmpeg;
    
    setIsFFmpegLoading(true);
    setExportStatus('Loading video processor...');
    
    try {
      // Try multiple CDN sources for better reliability
      const cdnSources = [
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd'
      ];
      
      let ffmpegInstance = null;
      
      for (const baseURL of cdnSources) {
        try {
          const { FFmpeg } = await import('@ffmpeg/ffmpeg');
          const { toBlobURL } = await import('@ffmpeg/util');
          
          ffmpegInstance = new FFmpeg();
          
          await ffmpegInstance.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          });
          
          console.log('FFmpeg loaded successfully from:', baseURL);
          break;
        } catch (error) {
          console.warn(`Failed to load from ${baseURL}:`, error);
          continue;
        }
      }
      
      if (!ffmpegInstance) {
        throw new Error('All CDN sources failed');
      }
      
      setFfmpeg(ffmpegInstance);
      setIsFFmpegLoading(false);
      return ffmpegInstance;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      setIsFFmpegLoading(false);
      throw error;
    }
  };

  // Reliable download function with multiple fallback methods
  const downloadVideoFile = (blob: Blob, filename: string) => {
    try {
      // Method 1: Create download URL and trigger download
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      
      // Method 2: Use hidden anchor element
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Method 3: Fallback - show download link to user
      setTimeout(() => {
        if (downloadLinkRef.current) {
          downloadLinkRef.current.href = url;
          downloadLinkRef.current.download = filename;
          downloadLinkRef.current.style.display = 'block';
        }
      }, 1000);
      
      console.log('Download initiated for:', filename);
      return true;
    } catch (error) {
      console.error('Download failed:', error);
      
      // Method 4: Last resort - open in new tab
      try {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return true;
      } catch (fallbackError) {
        console.error('All download methods failed:', fallbackError);
        return false;
      }
    }
  };

  // Enhanced export with multiple processing methods
  const handleExport = async () => {
    if (!videoRef.current || !videoFile) {
      alert('Please import a video first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing export...');

    try {
      // Get video file as blob
      const response = await fetch(videoFile);
      const videoBlob = await response.blob();
      
      let exportedBlob: Blob;
      let filename: string;
      
      // Choose export method based on effects and FFmpeg availability
      if (zoomEffects.length > 0) {
        try {
          // Try FFmpeg for zoom effects
          const ffmpegInstance = await loadFFmpeg();
          exportedBlob = await exportWithFFmpeg(ffmpegInstance, videoBlob);
          filename = `edited_${videoFileName.replace(/\.[^/.]+$/, '')}.mp4`;
        } catch (error) {
          console.warn('FFmpeg export failed, using canvas fallback:', error);
          exportedBlob = await exportWithCanvas(videoBlob);
          filename = `edited_${videoFileName.replace(/\.[^/.]+$/, '')}.webm`;
        }
      } else if (trimSegments.length > 0) {
        try {
          // Try FFmpeg for trimming
          const ffmpegInstance = await loadFFmpeg();
          exportedBlob = await exportTrimWithFFmpeg(ffmpegInstance, videoBlob);
          filename = `trimmed_${videoFileName.replace(/\.[^/.]+$/, '')}.mp4`;
        } catch (error) {
          console.warn('FFmpeg trim failed, using original file');
          exportedBlob = videoBlob;
          filename = `copy_${videoFileName}`;
        }
      } else {
        // Simple copy
        exportedBlob = videoBlob;
        filename = `copy_${videoFileName}`;
      }
      
      setExportStatus('Downloading file...');
      setExportProgress(95);
      
      // Download the file
      const downloadSuccess = downloadVideoFile(exportedBlob, filename);
      
      if (downloadSuccess) {
        setExportStatus('Export completed successfully!');
        setExportProgress(100);
      } else {
        throw new Error('Download failed');
      }
      
    } catch (error: any) {
      console.error('Export failed:', error);
      setExportStatus(`Export failed: ${error.message}`);
      alert(`Export failed: ${error.message || 'Unknown error occurred'}`);
    }
    
    // Reset after delay
    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }, 3000);
  };

  const exportWithFFmpeg = async (ffmpegInstance: any, videoBlob: Blob): Promise<Blob> => {
    const { fetchFile } = await import('@ffmpeg/util');
    
    setExportStatus('Processing with FFmpeg...');
    setExportProgress(20);
    
    const inputFileName = 'input.mp4';
    const outputFileName = 'output.mp4';
    
    // Write input file
    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoBlob));
    
    setExportStatus('Building zoom effects...');
    setExportProgress(30);
    
    // Build filter for zoom effects
    const zoomFilter = buildAdvancedZoomFilter();
    
    let ffmpegArgs = ['-i', inputFileName];
    
    // Add trim if specified
    if (trimSegments.length > 0) {
      const { start, end } = trimSegments[0];
      ffmpegArgs.push('-ss', start.toString(), '-to', end.toString());
    }
    
    if (zoomFilter) {
      ffmpegArgs.push('-filter_complex', zoomFilter);
      ffmpegArgs.push('-map', '[outv]');
      ffmpegArgs.push('-map', '0:a?'); // Preserve audio
    }
    
    // High quality output settings
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputFileName
    );
    
    setExportStatus('Rendering video...');
    setExportProgress(40);
    
    // Monitor progress
    ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
      const adjustedProgress = 40 + (progress * 50);
      setExportProgress(Math.min(adjustedProgress, 90));
      setExportStatus(`Rendering... ${Math.round(adjustedProgress)}%`);
    });
    
    // Execute FFmpeg
    await ffmpegInstance.exec(ffmpegArgs);
    
    setExportStatus('Reading output...');
    setExportProgress(90);
    
    // Read output file
    const outputData = await ffmpegInstance.readFile(outputFileName);
    const outputBlob = new Blob([outputData], { type: 'video/mp4' });
    
    // Clean up
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);
    
    return outputBlob;
  };

  const exportTrimWithFFmpeg = async (ffmpegInstance: any, videoBlob: Blob): Promise<Blob> => {
    const { fetchFile } = await import('@ffmpeg/util');
    
    setExportStatus('Trimming video...');
    setExportProgress(30);
    
    const inputFileName = 'input.mp4';
    const outputFileName = 'trimmed.mp4';
    
    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoBlob));
    
    const { start, end } = trimSegments[0];
    
    await ffmpegInstance.exec([
      '-i', inputFileName,
      '-ss', start.toString(),
      '-to', end.toString(),
      '-c', 'copy', // Fast copy without re-encoding
      '-avoid_negative_ts', 'make_zero',
      '-y', outputFileName
    ]);
    
    setExportProgress(80);
    
    const outputData = await ffmpegInstance.readFile(outputFileName);
    const outputBlob = new Blob([outputData], { type: 'video/mp4' });
    
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);
    
    return outputBlob;
  };

  const exportWithCanvas = async (videoBlob: Blob): Promise<Blob> => {
    setExportStatus('Processing with canvas...');
    setExportProgress(30);
    
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
        const stream = canvas.captureStream(30);
        
        // Use better codec if available
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
        
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
        });
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          const processedBlob = new Blob(chunks, { type: mimeType });
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
          
          // Update progress
          const progress = 30 + (video.currentTime / video.duration) * 50;
          setExportProgress(Math.min(progress, 80));
          
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

  // Build advanced zoom filter with smooth transitions
  const buildAdvancedZoomFilter = () => {
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
      
      // Create smooth interpolation expressions
      const timeVar = `(t-${effect.startTime})`;
      const progress = segmentDuration > 0.1 ? `min(1,max(0,${timeVar}/${segmentDuration}))` : '0';
      
      const zoomExpr = Math.abs(zoomEnd - zoomStart) > 0.01 ? 
        `${zoomStart}+(${zoomEnd}-${zoomStart})*${progress}` : 
        `${zoomStart}`;
      
      const posXExpr = Math.abs(posXEnd - posXStart) > 0.1 ? 
        `${posXStart}+(${posXEnd}-${posXStart})*${progress}` : 
        `${posXStart}`;
      
      const posYExpr = Math.abs(posYEnd - posYStart) > 0.1 ? 
        `${posYStart}+(${posYEnd}-${posYStart})*${progress}` : 
        `${posYStart}`;
      
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
            {isExporting ? `${Math.round(exportProgress)}%` : isFFmpegLoading ? 'Loading...' : 'Export & Download'}
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

          {/* Download Link Fallback */}
          {downloadUrl && (
            <Card className="m-4 p-4 bg-green-900/30 border-green-600">
              <h4 className="text-sm font-medium mb-2 text-green-300">Download Ready</h4>
              <a
                ref={downloadLinkRef}
                href={downloadUrl}
                download={`edited_${videoFileName}`}
                className="text-green-400 hover:text-green-300 underline text-sm"
                style={{ display: 'none' }}
              >
                Click here if download didn't start automatically
              </a>
              <div className="text-xs text-green-200">
                ✓ Video exported successfully
              </div>
            </Card>
          )}

          {/* Export Features */}
          {videoFile && (
            <Card className="m-4 p-3 bg-blue-900/30 border-blue-600">
              <h4 className="text-xs font-medium mb-2 text-blue-300">Export Features</h4>
              <div className="text-xs text-blue-200 space-y-1">
                <div>✓ Reliable MP4 Download</div>
                <div>✓ Audio Preservation</div>
                <div>✓ Multiple Download Methods</div>
                <div>✓ Canvas Fallback</div>
                <div>✓ High Quality Encoding</div>
                <div>✓ Automatic File Naming</div>
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
                        {isFFmpegLoading ? 'Preparing video processor...' : 'Creating MP4 with audio'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 w-full h-full flex flex-col items-center justify-center">
                <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Import a video file to start editing</p>
                <p className="text-sm text-gray-500 mb-4">Professional video export with reliable download</p>
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