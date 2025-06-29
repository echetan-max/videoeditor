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
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isFfmpegLoading, setIsFfmpegLoading] = useState(false);
  const [ffmpeg, setFfmpeg] = useState<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Get current active zoom effect
  const getCurrentZoomEffect = () => {
    return zoomEffects.find(effect => 
      currentTime >= effect.startTime && currentTime <= effect.endTime
    );
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

  // Load ffmpeg.wasm with ultra-fast settings
  const loadFfmpeg = async () => {
    if (!ffmpeg) {
      setIsFfmpegLoading(true);
      setExportStatus('Loading video processor...');
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
        
        const ffmpegInstance = new FFmpeg();
        
        // Use CDN URLs for faster loading
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
        
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setFfmpeg(ffmpegInstance);
        setIsFfmpegLoading(false);
        setExportStatus('');
        return ffmpegInstance;
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setIsFfmpegLoading(false);
        setExportStatus('Failed to load processor');
        throw error;
      }
    }
    return ffmpeg;
  };

  // Canvas-based export for zoom effects (much faster than FFmpeg for simple operations)
  const exportWithCanvas = async () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set canvas size to video size
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const chunks: Blob[] = [];
    const stream = canvas.captureStream(30); // 30 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5 Mbps
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    return new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = reject;

      // Start recording
      mediaRecorder.start();

      // Render frames
      let frameCount = 0;
      const fps = 30;
      const totalFrames = Math.floor(duration * fps);

      const renderFrame = () => {
        const currentVideoTime = frameCount / fps;
        
        if (currentVideoTime >= duration) {
          mediaRecorder.stop();
          return;
        }

        // Update progress
        setExportProgress(Math.round((frameCount / totalFrames) * 100));

        // Seek video to current time
        video.currentTime = currentVideoTime;

        video.onseeked = () => {
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Find active zoom effect
          const activeZoom = zoomEffects.find(effect => 
            currentVideoTime >= effect.startTime && currentVideoTime <= effect.endTime
          );

          if (activeZoom) {
            // Apply zoom transformation
            const scale = activeZoom.zoomLevel / 100;
            const centerX = (activeZoom.position.x / 100) * canvas.width;
            const centerY = (activeZoom.position.y / 100) * canvas.height;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(scale, scale);
            ctx.translate(-centerX, -centerY);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            // No zoom, draw normally
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }

          frameCount++;
          setTimeout(renderFrame, 1000 / fps);
        };
      };

      renderFrame();
    });
  };

  // Ultra-fast export with smart optimization
  const handleExport = async () => {
    if (!videoRef.current || !videoFile) {
      alert('Please import a video first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Analyzing video...');

    try {
      const hasZoomEffects = zoomEffects.length > 0;
      const hasTrimSegments = trimSegments.length > 0;
      const hasComplexEdits = hasZoomEffects || hasTrimSegments;

      // Strategy 1: No edits - instant copy
      if (!hasComplexEdits) {
        setExportStatus('No edits detected - copying original file...');
        setExportProgress(50);
        
        const response = await fetch(videoFile);
        const blob = await response.blob();
        
        setExportProgress(100);
        downloadBlob(blob, `copy_${videoFileName}`);
        
        setTimeout(() => {
          setIsExporting(false);
          setExportProgress(0);
          setExportStatus('');
        }, 1000);
        return;
      }

      // Strategy 2: Only zoom effects - use canvas recording (fastest)
      if (hasZoomEffects && !hasTrimSegments) {
        setExportStatus('Rendering zoom effects with canvas...');
        
        const blob = await exportWithCanvas();
        if (blob) {
          downloadBlob(blob, `zoomed_${videoFileName.replace(/\.[^/.]+$/, '')}.webm`);
          
          setTimeout(() => {
            setIsExporting(false);
            setExportProgress(0);
            setExportStatus('');
          }, 1000);
          return;
        }
      }

      // Strategy 3: FFmpeg for complex operations (slower but necessary)
      setExportStatus('Loading video processor...');
      const { fetchFile } = await import('@ffmpeg/util');
      const ffmpegInstance = await loadFfmpeg();

      // Enhanced progress tracking
      let lastProgress = 0;
      ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
        const currentProgress = Math.round(progress * 100);
        if (currentProgress > lastProgress) {
          lastProgress = currentProgress;
          setExportProgress(currentProgress);
          setExportStatus(`Processing... ${currentProgress}%`);
        }
      });

      setExportStatus('Loading video file...');
      setExportProgress(5);

      const response = await fetch(videoFile);
      const data = await response.blob();
      const fileName = videoFileName || 'input.mp4';
      
      await ffmpegInstance.writeFile(fileName, await fetchFile(data));
      setExportProgress(10);

      let outputName = 'output.mp4';
      let ffmpegArgs: string[] = [];

      if (hasTrimSegments && !hasZoomEffects) {
        setExportStatus('Applying trim operations...');
        
        if (trimSegments.length === 1) {
          const { start, end } = trimSegments[0];
          ffmpegArgs = [
            '-ss', String(start),
            '-i', fileName,
            '-t', String(end - start),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            outputName
          ];
        } else {
          // Multiple segments
          const segmentFiles: string[] = [];
          for (let i = 0; i < trimSegments.length; i++) {
            const { start, end } = trimSegments[i];
            const segName = `seg${i}.mp4`;
            
            await ffmpegInstance.exec([
              '-ss', String(start),
              '-i', fileName,
              '-t', String(end - start),
              '-c', 'copy',
              '-avoid_negative_ts', 'make_zero',
              segName
            ]);
            
            segmentFiles.push(segName);
          }

          const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
          await ffmpegInstance.writeFile('concatlist.txt', concatList);
          
          ffmpegArgs = [
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concatlist.txt',
            '-c', 'copy',
            outputName
          ];
        }
      } else if (hasZoomEffects) {
        setExportStatus('Processing zoom effects...');
        
        const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
        
        let filterParts = [];
        let concatInputs = [];
        
        for (let i = 0; i < sortedZooms.length; i++) {
          const effect = sortedZooms[i];
          const nextEffect = sortedZooms[i + 1];
          
          const zoomStart = effect.zoomLevel / 100;
          const zoomEnd = nextEffect ? nextEffect.zoomLevel / 100 : zoomStart;
          const posXStart = effect.position.x;
          const posXEnd = nextEffect ? nextEffect.position.x : posXStart;
          const posYStart = effect.position.y;
          const posYEnd = nextEffect ? nextEffect.position.y : posYStart;
          
          const segmentDuration = (nextEffect ? nextEffect.startTime : effect.endTime) - effect.startTime;
          
          // Optimized filter for speed
          if (segmentDuration > 0.1 && (Math.abs(zoomStart - zoomEnd) > 0.01 || Math.abs(posXStart - posXEnd) > 1 || Math.abs(posYStart - posYEnd) > 1)) {
            // Animated zoom
            const zoomExpr = `${zoomStart}+(${zoomEnd}-${zoomStart})*(t/${segmentDuration})`;
            const outW = `iw/(${zoomExpr})`;
            const outH = `ih/(${zoomExpr})`;
            const xExpr = `(iw-${outW})*(${posXStart}+(${posXEnd}-${posXStart})*(t/${segmentDuration}))/100`;
            const yExpr = `(ih-${outH})*(${posYStart}+(${posYEnd}-${posYStart})*(t/${segmentDuration}))/100`;
            
            filterParts.push(
              `[0:v]trim=start=${effect.startTime}:end=${effect.endTime},setpts=PTS-STARTPTS,crop=${outW}:${outH}:${xExpr}:${yExpr},scale=iw:ih[v${i}]`
            );
          } else {
            // Static zoom - much faster
            const outW = `iw/${zoomStart}`;
            const outH = `ih/${zoomStart}`;
            const xExpr = `(iw-${outW})*${posXStart}/100`;
            const yExpr = `(ih-${outH})*${posYStart}/100`;
            
            filterParts.push(
              `[0:v]trim=start=${effect.startTime}:end=${effect.endTime},setpts=PTS-STARTPTS,crop=${outW}:${outH}:${xExpr}:${yExpr},scale=iw:ih[v${i}]`
            );
          }
          
          concatInputs.push(`[v${i}]`);
        }
        
        filterParts.push(`${concatInputs.join('')}concat=n=${sortedZooms.length}:v=1:a=0[outv]`);
        
        if (hasTrimSegments && trimSegments.length > 0) {
          const { start, end } = trimSegments[0];
          ffmpegArgs = [
            '-ss', String(start),
            '-i', fileName,
            '-t', String(end - start)
          ];
        } else {
          ffmpegArgs = ['-i', fileName];
        }
        
        ffmpegArgs.push(
          '-filter_complex', filterParts.join(';'),
          '-map', '[outv]',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '30', // Lower quality for speed
          '-tune', 'fastdecode',
          '-c:a', 'aac',
          '-b:a', '96k', // Lower audio bitrate
          '-movflags', '+faststart',
          outputName
        );
      }

      setExportStatus('Executing video processing...');
      console.log('FFmpeg command:', ffmpegArgs.join(' '));
      
      // Execute with shorter timeout
      const exportPromise = ffmpegInstance.exec(ffmpegArgs);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Export timed out after 2 minutes')), 120000);
      });

      await Promise.race([exportPromise, timeoutPromise]);

      setExportStatus('Finalizing export...');
      setExportProgress(95);

      const output = await ffmpegInstance.readFile(outputName);
      const outputBlob = new Blob([output], { type: 'video/mp4' });
      
      setExportProgress(100);
      downloadBlob(outputBlob, `edited_${fileName.replace(/\.[^/.]+$/, '')}.mp4`);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus('');
      }, 1000);
      
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message || 'Unknown error'}`);
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <h1 className="text-xl font-bold">Advanced Video Editor</h1>
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
            disabled={!videoFile || isRecording || isExporting}
            className="bg-purple-600 border-purple-500 hover:bg-purple-700"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? `${exportProgress}%` : 'Export'}
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
              </div>
            </Card>
          )}

          {/* Export Progress */}
          {(isExporting || isFfmpegLoading) && (
            <Card className="m-4 p-4 bg-gray-700 border-gray-600">
              <h4 className="text-sm font-medium mb-2 text-white">Export Progress</h4>
              <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
                <div 
                  className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-300">{exportProgress}% Complete</div>
              {exportStatus && (
                <div className="text-xs text-purple-300 mt-1">{exportStatus}</div>
              )}
            </Card>
          )}

          {/* Export Strategy Info */}
          {videoFile && (
            <Card className="m-4 p-3 bg-green-900/30 border-green-600">
              <h4 className="text-xs font-medium mb-2 text-green-300">Export Strategy</h4>
              <div className="text-xs text-green-200 space-y-1">
                {zoomEffects.length === 0 && trimSegments.length === 0 && (
                  <div>✓ Instant copy (no processing needed)</div>
                )}
                {zoomEffects.length > 0 && trimSegments.length === 0 && (
                  <div>⚡ Canvas rendering (fast zoom effects)</div>
                )}
                {trimSegments.length > 0 && zoomEffects.length === 0 && (
                  <div>🚀 Stream copy (fast trim/cut)</div>
                )}
                {zoomEffects.length > 0 && trimSegments.length > 0 && (
                  <div>⚙️ Full processing (slower but complete)</div>
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
                />
                {/* Processing overlay */}
                {(isExporting || isRecording || isFfmpegLoading) && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-lg mb-1">
                        {isFfmpegLoading ? 'Loading processor...' : 
                         isExporting ? `Exporting ${exportProgress}%` : 
                         'Processing...'}
                      </p>
                      {exportStatus && (
                        <p className="text-sm text-gray-300">{exportStatus}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 w-full h-full flex flex-col items-center justify-center">
                <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Import a video file to start editing</p>
                <p className="text-sm text-gray-500 mb-4">Supports MP4, AVI, MOV, and more</p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-purple-600 hover:bg-purple-700"
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
                className="bg-purple-600 hover:bg-purple-700"
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

      {/* Hidden canvas for fast export processing */}
      <canvas 
        ref={canvasRef} 
        style={{ display: 'none' }}
        width={1920}
        height={1080}
      />

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