
import React, { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Scissors, Copy, Trash, SkipBack, SkipForward } from 'lucide-react';

interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  position: { x: number; y: number };
  name: string;
}

interface TimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (value: number[]) => void;
  onTrim?: (startTime: number, endTime: number) => void;
  onCut?: (cutTime: number) => void;
  zoomEffects?: ZoomEffect[];
  cutPoints?: number[];
  trimSegments?: {start: number, end: number}[];
}

const Timeline: React.FC<TimelineProps> = ({ 
  currentTime, 
  duration, 
  onSeek,
  onTrim,
  onCut,
  zoomEffects = [],
  cutPoints = [],
  trimSegments = []
}) => {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimmingMode, setIsTrimmingMode] = useState(false);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const handleSetTrimStart = () => {
    setTrimStart(currentTime);
    setIsTrimmingMode(true);
  };

  const handleSetTrimEnd = () => {
    setTrimEnd(currentTime);
    setIsTrimmingMode(true);
  };

  const handleApplyTrim = () => {
    if (onTrim && trimStart < trimEnd) {
      onTrim(trimStart, trimEnd);
      setIsTrimmingMode(false);
      setTrimStart(0);
      setTrimEnd(0);
    }
  };

  const handleCut = () => {
    if (onCut) {
      onCut(currentTime);
    }
  };

  const handleJumpToTrimStart = () => {
    onSeek([trimStart]);
  };

  const handleJumpToTrimEnd = () => {
    onSeek([trimEnd]);
  };

  const handleCopySegment = () => {
    console.log(`Copying segment from ${trimStart}s to ${trimEnd}s`);
  };

  const handleDeleteSegment = () => {
    console.log(`Deleting segment from ${trimStart}s to ${trimEnd}s`);
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white">Timeline Controls</h3>
          <div className="text-xs text-gray-400">
            Duration: {formatTime(duration)}
          </div>
        </div>

        {/* Manual Editing Controls */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-300">Trim Controls</h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetTrimStart}
                className="flex-1 text-xs bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                Set Start ({formatTime(trimStart)})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetTrimEnd}
                className="flex-1 text-xs bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                Set End ({formatTime(trimEnd)})
              </Button>
            </div>
            {isTrimmingMode && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleJumpToTrimStart}
                    className="flex-1 text-xs"
                  >
                    <SkipBack className="w-3 h-3 mr-1" />
                    Go to Start
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleJumpToTrimEnd}
                    className="flex-1 text-xs"
                  >
                    <SkipForward className="w-3 h-3 mr-1" />
                    Go to End
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleApplyTrim}
                    size="sm"
                    className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                    disabled={trimStart >= trimEnd}
                  >
                    Apply Trim
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTrimmingMode(false)}
                    className="flex-1 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-300">Edit Actions</h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCut}
                className="flex-1 text-xs bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                <Scissors className="w-3 h-3 mr-1" />
                Cut at {formatTime(currentTime)}
              </Button>
            </div>
            {isTrimmingMode && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySegment}
                  className="flex-1 text-xs bg-gray-700 border-gray-600 hover:bg-gray-600"
                  disabled={trimStart >= trimEnd}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSegment}
                  className="flex-1 text-xs bg-red-700 border-red-600 hover:bg-red-600"
                  disabled={trimStart >= trimEnd}
                >
                  <Trash className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Timeline */}
      <div className="space-y-4">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Current: {formatTime(currentTime)}</span>
          <span>Remaining: {formatTime(duration - currentTime)}</span>
        </div>
        
        <div className="relative">
          <Slider
            value={[currentTime]}
            onValueChange={onSeek}
            max={duration}
            step={0.1}
            className="w-full"
          />
          
          {/* Zoom Effect Markers */}
          {zoomEffects.map((effect) => (
            <div
              key={effect.id}
              className="absolute top-0 h-6 bg-purple-500/40 border border-purple-500 -mt-1 pointer-events-none"
              style={{
                left: `${(effect.startTime / duration) * 100}%`,
                width: `${((effect.endTime - effect.startTime) / duration) * 100}%`
              }}
            />
          ))}

          {/* Cut Point Markers */}
          {cutPoints.map((cutTime, index) => (
            <div
              key={index}
              className="absolute top-0 w-0.5 h-6 bg-red-500 -mt-1 pointer-events-none"
              style={{ left: `${(cutTime / duration) * 100}%` }}
            />
          ))}

          {/* Trim Segment Markers */}
          {trimSegments.map((segment, index) => (
            <div
              key={index}
              className="absolute top-0 h-6 bg-green-500/40 border border-green-500 -mt-1 pointer-events-none"
              style={{
                left: `${(segment.start / duration) * 100}%`,
                width: `${((segment.end - segment.start) / duration) * 100}%`
              }}
            />
          ))}
          
          {/* Active Trim Selection */}
          {isTrimmingMode && (
            <>
              <div
                className="absolute top-0 w-1 h-6 bg-green-500 -mt-1 pointer-events-none"
                style={{ left: `${(trimStart / duration) * 100}%` }}
              />
              <div
                className="absolute top-0 w-1 h-6 bg-red-500 -mt-1 pointer-events-none"
                style={{ left: `${(trimEnd / duration) * 100}%` }}
              />
              <div
                className="absolute top-0 h-6 bg-yellow-500/20 -mt-1 pointer-events-none"
                style={{
                  left: `${(trimStart / duration) * 100}%`,
                  width: `${((trimEnd - trimStart) / duration) * 100}%`
                }}
              />
            </>
          )}
        </div>

        {/* Time markers */}
        <div className="relative h-8 text-xs text-gray-400">
          {Array.from({ length: Math.ceil(duration / 10) + 1 }, (_, i) => {
            const time = i * 10;
            const percentage = (time / duration) * 100;
            return (
              <div
                key={i}
                className="absolute flex flex-col items-center cursor-pointer hover:text-white"
                style={{ left: `${percentage}%` }}
                onClick={() => onSeek([time])}
              >
                <div className="w-px h-2 bg-gray-500"></div>
                <span>{formatTime(time)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend and Status */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 bg-purple-500/40 border border-purple-500"></div>
            <span>Zoom Effects ({zoomEffects.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-3 bg-red-500"></div>
            <span>Cut Points ({cutPoints.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 bg-green-500/40 border border-green-500"></div>
            <span>Trim Segments ({trimSegments.length})</span>
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {isTrimmingMode && (
            <span className="text-yellow-400">
              Selection: {formatTime(Math.abs(trimEnd - trimStart))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Timeline;
