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
  const [isFfmpegLoading, setIsFfmpegLoading] = useState(false);
  const [ffmpeg, setFfmpeg] = useState<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Load FFmpeg with proper error handling
  const loadFfmpeg = async () => {
    if (!ffmpeg) {
      setIsFfmpegLoading(true);
      setExportStatus('Loading FFmpeg...');
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
        
        const ffmpegInstance = new FFmpeg();
        
        // Use stable CDN URLs
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
        setExportStatus('Failed to load FFmpeg');
        throw error;
      }
    }
    return ffmpeg;
  };

  const handleExport = async () => {
    if (!videoRef.current || !videoFile) {
      alert('Please import a video first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Initializing export...');

    try {
      const { fetchFile } = await import('@ffmpeg/util');
      const ffmpegInstance = await loadFfmpeg();

      // Set up progress tracking
      ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
        const currentProgress = Math.round(progress * 100);
        setExportProgress(currentProgress);
        setExportStatus(`Processing video... ${currentProgress}%`);
      });

      setExportStatus('Loading video file...');
      setExportProgress(5);

      // Load the video file
      const response = await fetch(videoFile);
      const videoBlob = await response.blob();
      const inputFileName = 'input.mp4';
      
      await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoBlob));
      setExportProgress(10);

      const hasZoomEffects = zoomEffects.length > 0;
      const hasTrimSegments = trimSegments.length > 0;
      const outputFileName = 'output.mp4';

      let ffmpegArgs: string[] = [];

      if (!hasZoomEffects && !hasTrimSegments) {
        // No edits - just copy
        setExportStatus('No edits detected - copying file...');
        ffmpegArgs = [
          '-i', inputFileName,
          '-c', 'copy',
          outputFileName
        ];
      } else if (!hasZoomEffects && hasTrimSegments) {
        // Only trim operations
        setExportStatus('Applying trim operations...');
        
        if (trimSegments.length === 1) {
          const { start, end } = trimSegments[0];
          ffmpegArgs = [
            '-ss', start.toString(),
            '-i', inputFileName,
            '-t', (end - start).toString(),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            outputFileName
          ];
        } else {
          // Multiple trim segments - concatenate
          const segmentFiles: string[] = [];
          
          for (let i = 0; i < trimSegments.length; i++) {
            const { start, end } = trimSegments[i];
            const segmentName = `segment_${i}.mp4`;
            
            await ffmpegInstance.exec([
              '-ss', start.toString(),
              '-i', inputFileName,
              '-t', (end - start).toString(),
              '-c', 'copy',
              '-avoid_negative_ts', 'make_zero',
              segmentName
            ]);
            
            segmentFiles.push(segmentName);
          }

          // Create concat file
          const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
          await ffmpegInstance.writeFile('concat.txt', concatContent);
          
          ffmpegArgs = [
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            outputFileName
          ];
        }
      } else {
        // Zoom effects (with or without trim)
        setExportStatus('Processing zoom effects...');
        
        // Sort zoom effects by start time
        const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
        
        // Build filter complex for zoom effects
        const filterParts: string[] = [];
        const concatInputs: string[] = [];
        
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
          
          // Create zoom filter
          if (segmentDuration > 0.1 && (Math.abs(zoomStart - zoomEnd) > 0.01 || Math.abs(posXStart - posXEnd) > 1 || Math.abs(posYStart - posYEnd) > 1)) {
            // Animated zoom with smooth transitions
            const zoomExpr = `${zoomStart}+(${zoomEnd}-${zoomStart})*(t/${segmentDuration})`;
            const outW = `iw/(${zoomExpr})`;
            const outH = `ih/(${zoomExpr})`;
            const xExpr = `(iw-${outW})*(${posXStart}+(${posXEnd}-${posXStart})*(t/${segmentDuration}))/100`;
            const yExpr = `(ih-${outH})*(${posYStart}+(${posYEnd}-${posYStart})*(t/${segmentDuration}))/100`;
            
            filterParts.push(
              `[0:v]trim=start=${effect.startTime}:end=${effect.endTime},setpts=PTS-STARTPTS,crop=${outW}:${outH}:${xExpr}:${yExpr},scale=iw:ih[v${i}]`
            );
          } else {
            // Static zoom - much simpler and faster
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
        
        // Add concat filter
        filterParts.push(`${concatInputs.join('')}concat=n=${sortedZooms.length}:v=1:a=0[outv]`);
        
        // Build FFmpeg command
        if (hasTrimSegments && trimSegments.length > 0) {
          const { start, end } = trimSegments[0];
          ffmpegArgs = [
            '-ss', start.toString(),
            '-i', inputFileName,
            '-t', (end - start).toString()
          ];
        } else {
          ffmpegArgs = ['-i', inputFileName];
        }
        
        ffmpegArgs.push(
          '-filter_complex', filterParts.join(';'),
          '-map', '[outv]',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outputFileName
        );
      }

      setExportStatus('Executing FFmpeg...');
      console.log('FFmpeg command:', ffmpegArgs.join(' '));
      
      // Execute FFmpeg with timeout
      const exportPromise = ffmpegInstance.exec(ffmpegArgs);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Export timed out after 5 minutes')), 300000);
      });

      await Promise.race([exportPromise, timeoutPromise]);

      setExportStatus('Finalizing export...');
      setExportProgress(95);

      // Read the output file
      const outputData = await ffmpegInstance.readFile(outputFileName);
      const outputBlob = new Blob([outputData], { type: 'video/mp4' });
      
      // Download the file
      const url = URL.createObjectURL(outputBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${videoFileName.replace(/\.[^/.]+$/, '')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
      setExportStatus('Export completed successfully!');
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus('');
      }, 2000);
      
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message || 'Unknown error occurred'}`);
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('Export failed');
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
            disabled={!videoFile || isExporting || isFfmpegLoading}
            className="bg-purple-600 border-purple-500 hover:bg-purple-700"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? `${exportProgress}%` : 'Export MP4'}
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

          {/* Export Info */}
          {videoFile && (
            <Card className="m-4 p-3 bg-blue-900/30 border-blue-600">
              <h4 className="text-xs font-medium mb-2 text-blue-300">Export Info</h4>
              <div className="text-xs text-blue-200 space-y-1">
                <div>• Output format: MP4 (H.264)</div>
                <div>• Audio: AAC 128kbps</div>
                <div>• Quality: High (CRF 23)</div>
                {zoomEffects.length === 0 && trimSegments.length === 0 && (
                  <div>• Mode: Fast copy (no re-encoding)</div>
                )}
                {zoomEffects.length > 0 && (
                  <div>• Mode: Zoom processing required</div>
                )}
                {trimSegments.length > 0 && zoomEffects.length === 0 && (
                  <div>• Mode: Fast trim (stream copy)</div>
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
                {(isExporting || isFfmpegLoading) && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-lg mb-1">
                        {isFfmpegLoading ? 'Loading FFmpeg...' : 
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