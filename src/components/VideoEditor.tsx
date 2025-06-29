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

  // Load ffmpeg.wasm on demand with optimized settings
  const loadFfmpeg = async () => {
    if (!ffmpeg) {
      setIsFfmpegLoading(true);
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
        
        const ffmpegInstance = new FFmpeg();
        
        // Use optimized core URLs for better performance
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
        
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setFfmpeg(ffmpegInstance);
        setIsFfmpegLoading(false);
        return ffmpegInstance;
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setIsFfmpegLoading(false);
        throw error;
      }
    }
    return ffmpeg;
  };

  // Optimized export with better performance strategies
  const handleExport = async () => {
    if (!videoRef.current || !videoFile) {
      alert('Please import a video first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const { fetchFile } = await import('@ffmpeg/util');
      const ffmpegInstance = await loadFfmpeg();

      // Progress tracking
      ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
        setExportProgress(Math.round(progress * 100));
      });

      // Get the video file as a blob
      const response = await fetch(videoFile);
      const data = await response.blob();
      const fileName = videoFileName || 'input.mp4';
      
      await ffmpegInstance.writeFile(fileName, await fetchFile(data));

      let outputName = 'output.mp4';
      let ffmpegArgs: string[] = [];

      // Determine optimal export strategy based on edits
      const hasZoomEffects = zoomEffects.length > 0;
      const hasTrimSegments = trimSegments.length > 0;
      const hasComplexEdits = hasZoomEffects || hasTrimSegments;

      if (!hasComplexEdits) {
        // No edits: ultra-fast stream copy
        ffmpegArgs = [
          '-i', fileName,
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputName
        ];
      } else if (hasTrimSegments && !hasZoomEffects) {
        // Only trim operations: fast segment copy
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
          // Multiple segments: create concat list
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

          // Create concat list
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
        // Zoom effects: optimized encoding with hardware acceleration hints
        const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
        
        // Build optimized filter chain
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
          
          // Simplified zoom expression for better performance
          if (segmentDuration > 0 && (zoomStart !== zoomEnd || posXStart !== posXEnd || posYStart !== posYEnd)) {
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
        
        // Apply trim if specified
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
          // Optimized encoding settings for speed
          '-c:v', 'libx264',
          '-preset', 'ultrafast',  // Fastest preset
          '-crf', '28',            // Slightly lower quality for speed
          '-tune', 'fastdecode',   // Optimize for fast decoding
          '-c:a', 'aac',
          '-b:a', '128k',          // Lower audio bitrate
          '-movflags', '+faststart', // Web optimization
          outputName
        );
      }

      console.log('FFmpeg command:', ffmpegArgs.join(' '));
      
      // Execute with timeout
      const exportPromise = ffmpegInstance.exec(ffmpegArgs);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Export timed out after 5 minutes')), 300000);
      });

      await Promise.race([exportPromise, timeoutPromise]);

      // Read and download the output
      const output = await ffmpegInstance.readFile(outputName);
      const outputBlob = new Blob([output], { type: 'video/mp4' });
      const url = URL.createObjectURL(outputBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${fileName.replace(/\.[^/.]+$/, '')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Cleanup
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
      
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message || 'Unknown error'}`);
      setIsExporting(false);
      setExportProgress(0);
    }
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
            {isExporting ? `Exporting... ${exportProgress}%` : 'Export'}
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
          {isExporting && (
            <Card className="m-4 p-4 bg-gray-700 border-gray-600">
              <h4 className="text-sm font-medium mb-2 text-white">Export Progress</h4>
              <div className="w-full bg-gray-600 rounded-full h-2 mb-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-300">{exportProgress}% Complete</div>
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
            {/* Debug overlay for zoom and container size */}
            {videoFile && (
              <div style={{position: 'absolute', top: 8, right: 8, zIndex: 20, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 12}}>
                Zoom: {currentZoom ? currentZoom.zoomLevel : 100}%<br/>
                Container: {previewContainerRef.current?.offsetWidth}x{previewContainerRef.current?.offsetHeight}
              </div>
            )}
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
                      <p>
                        {isFfmpegLoading ? 'Loading video processor...' : 
                         isExporting ? `Exporting video... ${exportProgress}%` : 
                         'Processing video...'}
                      </p>
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

      {/* Hidden canvas for export processing */}
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