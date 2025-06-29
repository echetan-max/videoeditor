import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Upload, Download, AlertCircle } from 'lucide-react';
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
  const [originalVideoFile, setOriginalVideoFile] = useState<File | null>(null);
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm'>('webm');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

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
      setOriginalVideoFile(file);
      setCurrentTime(0);
      setIsPlaying(false);
      setZoomEffects([]);
      setSelectedZoomId(null);
      setTrimSegments([]);
      setCutPoints([]);
      setExportError(null);
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

  // FIXED: Multiple CDN fallbacks for FFmpeg loading
  const loadFFmpeg = async () => {
    if (ffmpeg) return ffmpeg;
    
    setIsFFmpegLoading(true);
    setExportStatus('🔄 Loading FFmpeg.wasm...');
    setExportProgress(5);
    
    const cdnUrls = [
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
      'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/umd'
    ];
    
    for (let i = 0; i < cdnUrls.length; i++) {
      try {
        const baseURL = cdnUrls[i];
        console.log(`🚀 Trying CDN ${i + 1}/${cdnUrls.length}: ${baseURL}`);
        setExportStatus(`📦 Loading from CDN ${i + 1}/${cdnUrls.length}...`);
        
        // Import FFmpeg modules
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
        
        const ffmpegInstance = new FFmpeg();
        
        // Set up logging
        ffmpegInstance.on('log', ({ message }) => {
          console.log('[FFmpeg]', message);
        });
        
        // Set up progress tracking
        ffmpegInstance.on('progress', ({ progress }) => {
          const adjustedProgress = 30 + (progress * 60); // 30-90% range for processing
          setExportProgress(Math.min(adjustedProgress, 90));
          setExportStatus(`🎬 Processing video... ${Math.round(adjustedProgress)}%`);
        });
        
        setExportProgress(10 + (i * 5));
        
        // Try to load from this CDN
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        setFfmpeg(ffmpegInstance);
        setIsFFmpegLoading(false);
        setExportStatus('✅ FFmpeg loaded successfully!');
        setExportProgress(25);
        
        console.log('✅ FFmpeg.wasm loaded successfully from:', baseURL);
        return ffmpegInstance;
        
      } catch (error) {
        console.warn(`❌ CDN ${i + 1} failed:`, error);
        if (i === cdnUrls.length - 1) {
          // All CDNs failed
          throw new Error(`All CDNs failed. Last error: ${error}`);
        }
        // Try next CDN
        continue;
      }
    }
  };

  // Create reliable download with multiple methods
  const triggerDownload = (blob: Blob, filename: string) => {
    try {
      // Method 1: Create object URL and download link
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      
      // Method 2: Programmatic download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Method 3: Update visible download link as fallback
      if (downloadLinkRef.current) {
        downloadLinkRef.current.href = url;
        downloadLinkRef.current.download = filename;
        downloadLinkRef.current.style.display = 'inline-block';
        downloadLinkRef.current.textContent = `Download ${filename}`;
      }
      
      console.log('✅ Download triggered for:', filename);
      return true;
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      
      // Method 4: Last resort - open in new window
      try {
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          newWindow.document.title = filename;
        }
        return true;
      } catch (fallbackError) {
        console.error('❌ All download methods failed:', fallbackError);
        return false;
      }
    }
  };

  // FIXED: Simplified export with WebM support
  const handleExport = async () => {
    if (!originalVideoFile) {
      alert('Please import a video file first');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('🚀 Starting export...');
    setExportError(null);

    try {
      // Load FFmpeg
      setExportStatus('📦 Loading FFmpeg.wasm...');
      const ffmpegInstance = await loadFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');
      
      setExportStatus('📁 Preparing video file...');
      setExportProgress(30);
      
      // Write input file to FFmpeg filesystem
      const inputFileName = 'input.mp4';
      console.log('📥 Writing input file to FFmpeg filesystem...');
      await ffmpegInstance.writeFile(inputFileName, await fetchFile(originalVideoFile));
      
      setExportStatus('⚙️ Building export command...');
      setExportProgress(35);
      
      // Build FFmpeg command based on format
      let ffmpegArgs = ['-i', inputFileName];
      let outputFileName = '';
      let mimeType = '';
      
      if (exportFormat === 'webm') {
        outputFileName = 'output.webm';
        mimeType = 'video/webm';
        
        // Handle trimming
        if (trimSegments.length > 0) {
          const { start, end } = trimSegments[0];
          ffmpegArgs.push('-ss', start.toString(), '-to', end.toString());
        }
        
        // Handle zoom effects (simplified for WebM)
        if (zoomEffects.length > 0) {
          const firstZoom = zoomEffects[0];
          const scale = firstZoom.zoomLevel / 100;
          const cropW = `iw/${scale}`;
          const cropH = `ih/${scale}`;
          const cropX = `(iw-${cropW})*${firstZoom.position.x}/100`;
          const cropY = `(ih-${cropH})*${firstZoom.position.y}/100`;
          
          ffmpegArgs.push(
            '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=iw:ih`,
            '-ss', firstZoom.startTime.toString(),
            '-to', firstZoom.endTime.toString()
          );
        }
        
        // WebM settings - MUCH FASTER
        ffmpegArgs.push(
          '-c:v', 'libvpx-vp9',        // VP9 codec
          '-crf', '30',                // Good quality, fast encoding
          '-b:v', '1M',                // 1Mbps video bitrate
          '-c:a', 'libopus',           // Opus audio codec
          '-b:a', '128k',              // Audio bitrate
          '-cpu-used', '8',            // Fastest CPU preset
          '-deadline', 'realtime',     // Real-time encoding
          '-y',                        // Overwrite output
          outputFileName
        );
        
      } else {
        // MP4 format
        outputFileName = 'output.mp4';
        mimeType = 'video/mp4';
        
        // Handle trimming
        if (trimSegments.length > 0) {
          const { start, end } = trimSegments[0];
          ffmpegArgs.push('-ss', start.toString(), '-to', end.toString());
        }
        
        // Handle zoom effects
        if (zoomEffects.length > 0) {
          const firstZoom = zoomEffects[0];
          const scale = firstZoom.zoomLevel / 100;
          const cropW = `iw/${scale}`;
          const cropH = `ih/${scale}`;
          const cropX = `(iw-${cropW})*${firstZoom.position.x}/100`;
          const cropY = `(ih-${cropH})*${firstZoom.position.y}/100`;
          
          ffmpegArgs.push(
            '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=iw:ih`,
            '-ss', firstZoom.startTime.toString(),
            '-to', firstZoom.endTime.toString()
          );
        }
        
        // MP4 settings
        ffmpegArgs.push(
          '-c:v', 'libx264',           // H.264 video codec
          '-preset', 'ultrafast',      // Fastest encoding
          '-crf', '28',               // Good quality, fast encoding
          '-c:a', 'aac',              // AAC audio codec
          '-b:a', '128k',             // Audio bitrate
          '-movflags', '+faststart',   // Web optimization
          '-y',                       // Overwrite output
          outputFileName
        );
      }
      
      setExportStatus(`🎬 Processing ${exportFormat.toUpperCase()} with FFmpeg...`);
      setExportProgress(40);
      
      console.log('🎬 Running FFmpeg with args:', ffmpegArgs);
      
      // Execute FFmpeg
      await ffmpegInstance.exec(ffmpegArgs);
      
      setExportStatus('📤 Reading processed video...');
      setExportProgress(92);
      
      // Read the output file
      const outputData = await ffmpegInstance.readFile(outputFileName);
      const outputBlob = new Blob([outputData], { type: mimeType });
      
      setExportStatus('💾 Preparing download...');
      setExportProgress(95);
      
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const extension = exportFormat === 'webm' ? 'webm' : 'mp4';
      const finalFilename = `edited_${videoFileName.replace(/\.[^/.]+$/, '')}_${timestamp}.${extension}`;
      
      // Trigger download
      const downloadSuccess = triggerDownload(outputBlob, finalFilename);
      
      if (downloadSuccess) {
        setExportStatus(`✅ ${exportFormat.toUpperCase()} export completed successfully!`);
        setExportProgress(100);
        
        // Clean up FFmpeg files
        try {
          await ffmpegInstance.deleteFile(inputFileName);
          await ffmpegInstance.deleteFile(outputFileName);
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError);
        }
        
      } else {
        throw new Error('Download failed - please try again');
      }
      
    } catch (error: any) {
      console.error('❌ Export failed:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      setExportError(errorMessage);
      setExportStatus(`❌ Export failed: ${errorMessage}`);
      alert(`Export failed: ${errorMessage}\n\nTry switching to WebM format for better compatibility.`);
    }
    
    // Reset export state after delay
    setTimeout(() => {
      if (!exportError) {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus('');
      }
    }, 5000);
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
          <h1 className="text-xl font-bold">⚡ FAST Video Editor</h1>
          {videoFileName && (
            <p className="text-sm text-gray-400 mt-1">Editing: {videoFileName}</p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {/* Format Selector */}
          <div className="flex gap-1 bg-gray-800 rounded p-1">
            <Button
              variant={exportFormat === 'webm' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setExportFormat('webm')}
              className={`text-xs ${exportFormat === 'webm' ? 'bg-green-600' : ''}`}
            >
              WebM (Fast)
            </Button>
            <Button
              variant={exportFormat === 'mp4' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setExportFormat('mp4')}
              className={`text-xs ${exportFormat === 'mp4' ? 'bg-blue-600' : ''}`}
            >
              MP4 (Compatible)
            </Button>
          </div>
          
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
            disabled={!originalVideoFile || isExporting || isFFmpegLoading}
            className={`${exportFormat === 'webm' ? 'bg-green-600 border-green-500 hover:bg-green-700' : 'bg-blue-600 border-blue-500 hover:bg-blue-700'} disabled:opacity-50`}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? `${Math.round(exportProgress)}%` : isFFmpegLoading ? 'Loading...' : `EXPORT ${exportFormat.toUpperCase()}`}
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar */}
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
          
          {/* Export Format Info */}
          <Card className="m-4 p-4 bg-gray-700 border-gray-600">
            <h4 className="text-sm font-medium mb-2 text-white">Export Format</h4>
            <div className="text-xs text-gray-300 space-y-2">
              <div className={`p-2 rounded ${exportFormat === 'webm' ? 'bg-green-900/30 border border-green-600' : 'bg-gray-600'}`}>
                <div className="font-medium text-green-300">WebM (Recommended)</div>
                <div>• 3-5x faster export</div>
                <div>• VP9 + Opus codecs</div>
                <div>• Excellent quality</div>
                <div>• Modern browser support</div>
              </div>
              <div className={`p-2 rounded ${exportFormat === 'mp4' ? 'bg-blue-900/30 border border-blue-600' : 'bg-gray-600'}`}>
                <div className="font-medium text-blue-300">MP4 (Universal)</div>
                <div>• Slower but compatible</div>
                <div>• H.264 + AAC codecs</div>
                <div>• Works everywhere</div>
                <div>• Larger file sizes</div>
              </div>
            </div>
          </Card>
          
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
                {isFFmpegLoading ? '📦 Loading FFmpeg' : `🎬 Export Progress (${exportFormat.toUpperCase()})`}
              </h4>
              <div className="w-full bg-gray-600 rounded-full h-4 mb-2">
                <div 
                  className={`${exportFormat === 'webm' ? 'bg-green-600' : 'bg-blue-600'} h-4 rounded-full transition-all duration-300 flex items-center justify-center text-xs font-bold`}
                  style={{ width: `${exportProgress}%` }}
                >
                  {exportProgress > 10 && `${Math.round(exportProgress)}%`}
                </div>
              </div>
              <div className="text-xs text-gray-300">{Math.round(exportProgress)}% Complete</div>
              {exportStatus && (
                <div className={`text-xs mt-1 ${exportFormat === 'webm' ? 'text-green-300' : 'text-blue-300'}`}>{exportStatus}</div>
              )}
              {isExporting && (
                <div className="text-xs text-yellow-300 mt-1">
                  ⚡ {exportFormat === 'webm' ? 'WebM: Ultra-fast VP9 encoding' : 'MP4: H.264 encoding'}
                </div>
              )}
            </Card>
          )}

          {/* Export Error */}
          {exportError && (
            <Card className="m-4 p-4 bg-red-900/30 border-red-600">
              <h4 className="text-sm font-medium mb-2 text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Export Error
              </h4>
              <div className="text-xs text-red-200 mb-2">{exportError}</div>
              <div className="text-xs text-yellow-200 mb-2">
                💡 Try switching to WebM format for better compatibility
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setExportError(null);
                  setIsExporting(false);
                  setExportProgress(0);
                  setExportStatus('');
                  setExportFormat('webm'); // Switch to WebM on error
                }}
                className="mt-2 text-xs"
              >
                Try Again with WebM
              </Button>
            </Card>
          )}

          {/* Download Link */}
          {downloadUrl && (
            <Card className="m-4 p-4 bg-green-900/30 border-green-600">
              <h4 className="text-sm font-medium mb-2 text-green-300">✅ Download Ready</h4>
              <a
                ref={downloadLinkRef}
                href={downloadUrl}
                download={`edited_${videoFileName}`}
                className="text-green-400 hover:text-green-300 underline text-sm block mb-2"
              >
                🎬 Click here to download your {exportFormat.toUpperCase()} video
              </a>
              <div className="text-xs text-green-200">
                {exportFormat.toUpperCase()} video with audio exported successfully
              </div>
            </Card>
          )}

          {/* Quick Export Tips */}
          {videoFile && (
            <Card className="m-4 p-3 bg-blue-900/30 border-blue-600">
              <h4 className="text-xs font-medium mb-2 text-blue-300">⚡ Speed Tips</h4>
              <div className="text-xs text-blue-200 space-y-1">
                <div>• Use WebM for 3-5x faster export</div>
                <div>• Shorter videos = faster processing</div>
                <div>• Trim unnecessary parts first</div>
                <div>• Simple zooms work best</div>
                <div>• Audio is always preserved</div>
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
                
                {/* Export format indicator */}
                <div className={`absolute top-4 right-4 ${exportFormat === 'webm' ? 'bg-green-600/80' : 'bg-blue-600/80'} text-white px-2 py-1 rounded text-sm`}>
                  Export: {exportFormat.toUpperCase()}
                </div>
                
                {/* Processing overlay */}
                {(isExporting || isFFmpegLoading) && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-white text-center max-w-md">
                      <div className={`animate-spin w-12 h-12 border-4 ${exportFormat === 'webm' ? 'border-green-500' : 'border-blue-500'} border-t-transparent rounded-full mx-auto mb-4`}></div>
                      <p className="text-xl mb-2 font-bold">
                        {isFFmpegLoading ? '📦 Loading FFmpeg.wasm...' : `🎬 Exporting ${exportFormat.toUpperCase()} ${Math.round(exportProgress)}%`}
                      </p>
                      {exportStatus && (
                        <p className="text-sm text-gray-300 mb-2">{exportStatus}</p>
                      )}
                      <p className="text-xs text-green-300">
                        {isFFmpegLoading ? 'Trying multiple CDNs for reliability...' : 
                         exportFormat === 'webm' ? 'Creating WebM with VP9 + Opus' : 'Creating MP4 with H.264 + AAC'}
                      </p>
                      {isExporting && (
                        <div className="mt-4 w-64 bg-gray-600 rounded-full h-2">
                          <div 
                            className={`${exportFormat === 'webm' ? 'bg-green-500' : 'bg-blue-500'} h-2 rounded-full transition-all duration-300`}
                            style={{ width: `${exportProgress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 w-full h-full flex flex-col items-center justify-center">
                <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Import a video file to start editing</p>
                <p className="text-sm text-gray-500 mb-4">⚡ Fast FFmpeg.wasm processing with WebM/MP4 export</p>
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