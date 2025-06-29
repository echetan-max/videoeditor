import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Plus, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';

interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  position: { x: number; y: number };
  name: string;
}

interface ZoomControlsProps {
  zoomEffects: ZoomEffect[];
  selectedZoomId: string | null;
  onSelectZoom: (id: string | null) => void;
  onAddZoom: () => void;
  onUpdateZoom: (id: string, updates: Partial<ZoomEffect>) => void;
  onDeleteZoom: (id: string) => void;
  currentTime: number;
  duration: number;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomEffects,
  selectedZoomId,
  onSelectZoom,
  onAddZoom,
  onUpdateZoom,
  onDeleteZoom,
  currentTime,
  duration
}) => {
  const selectedZoom = zoomEffects.find(z => z.id === selectedZoomId);
  const [isDragging, setIsDragging] = useState(false);

  const handleZoomLevelChange = (value: number[]) => {
    if (selectedZoom) {
      onUpdateZoom(selectedZoom.id, { zoomLevel: value[0] });
    }
  };

  const handlePositionChange = (axis: 'x' | 'y', value: number[]) => {
    if (selectedZoom) {
      const newPosition = { ...selectedZoom.position };
      newPosition[axis] = value[0];
      onUpdateZoom(selectedZoom.id, { position: newPosition });
    }
  };

  const handleTimingChange = (type: 'start' | 'end', value: number[]) => {
    if (selectedZoom) {
      if (type === 'start') {
        onUpdateZoom(selectedZoom.id, { startTime: value[0] });
      } else {
        onUpdateZoom(selectedZoom.id, { endTime: value[0] });
      }
    }
  };

  const handlePreviewMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedZoom) return;
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onUpdateZoom(selectedZoom.id, { position: { x: Math.max(10, Math.min(90, x)), y: Math.max(10, Math.min(90, y)) } });
  };

  const handlePreviewMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !selectedZoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onUpdateZoom(selectedZoom.id, { position: { x: Math.max(10, Math.min(90, x)), y: Math.max(10, Math.min(90, y)) } });
  };

  const handlePreviewMouseUp = () => {
    setIsDragging(false);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 text-white">Zoom Effects</h3>
        
        <Button
          onClick={onAddZoom}
          className="w-full mb-4 bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Zoom Effect
        </Button>

        {/* Performance Tips */}
        <Card className="mb-4 p-3 bg-blue-900/30 border-blue-600">
          <h4 className="text-xs font-medium mb-2 text-blue-300">Export Performance Tips</h4>
          <div className="text-xs text-blue-200 space-y-1">
            <div>• Fewer zoom effects = faster export</div>
            <div>• Static zooms export faster than animated ones</div>
            <div>• Shorter videos process much quicker</div>
            <div>• Trim unnecessary parts before adding effects</div>
          </div>
        </Card>

        {/* Zoom Effects List */}
        <div className="space-y-2 mb-4">
          {zoomEffects.map((zoom) => {
            const isAnimated = zoomEffects.some(z => 
              z.id !== zoom.id && 
              Math.abs(z.startTime - zoom.endTime) < 0.1 && 
              (z.zoomLevel !== zoom.zoomLevel || z.position.x !== zoom.position.x || z.position.y !== zoom.position.y)
            );
            
            return (
              <div
                key={zoom.id}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  selectedZoomId === zoom.id
                    ? 'bg-purple-600/30 border-purple-500'
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                }`}
                onClick={() => onSelectZoom(zoom.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      {zoom.name}
                      {isAnimated && (
                        <span className="text-xs bg-orange-600 px-1 rounded">ANIMATED</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTime(zoom.startTime)} - {formatTime(zoom.endTime)}
                    </div>
                    <div className="text-xs text-gray-400">
                      Zoom: {zoom.zoomLevel}%
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteZoom(zoom.id);
                    }}
                    className="p-1 h-6 w-6 hover:bg-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedZoom && (
        <Card className="p-4 bg-gray-700 border-gray-600">
          <h4 className="text-sm font-medium mb-3 text-white">Edit Selected Zoom</h4>
          
          <div className="space-y-4">
            {/* Timing Controls */}
            <div>
              <label className="text-xs text-gray-300 mb-2 block">Timing</label>
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Start Time: {formatTime(selectedZoom.startTime)}</div>
                  <Slider
                    value={[selectedZoom.startTime]}
                    onValueChange={(value) => handleTimingChange('start', value)}
                    min={0}
                    max={Math.min(selectedZoom.endTime - 0.1, duration)}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">End Time: {formatTime(selectedZoom.endTime)}</div>
                  <Slider
                    value={[selectedZoom.endTime]}
                    onValueChange={(value) => handleTimingChange('end', value)}
                    min={Math.max(selectedZoom.startTime + 0.1, 0)}
                    max={duration}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Zoom Level */}
            <div>
              <label className="text-xs text-gray-300 mb-2 block">Zoom Level</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleZoomLevelChange([Math.max(100, selectedZoom.zoomLevel - 25)])}
                  className="p-1 h-8 w-8"
                >
                  <ZoomOut className="w-3 h-3" />
                </Button>
                <Slider
                  value={[selectedZoom.zoomLevel]}
                  onValueChange={handleZoomLevelChange}
                  min={100}
                  max={500}
                  step={5}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleZoomLevelChange([Math.min(500, selectedZoom.zoomLevel + 25)])}
                  className="p-1 h-8 w-8"
                >
                  <ZoomIn className="w-3 h-3" />
                </Button>
              </div>
              <div className="text-xs text-gray-400 mt-1">{selectedZoom.zoomLevel}%</div>
            </div>

            {/* Position Controls */}
            <div>
              <label className="text-xs text-gray-300 mb-2 block">Zoom Center Position</label>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Horizontal: {selectedZoom.position.x.toFixed(0)}%</div>
                  <Slider
                    value={[selectedZoom.position.x]}
                    onValueChange={(value) => handlePositionChange('x', value)}
                    min={10}
                    max={90}
                    step={1}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Vertical: {selectedZoom.position.y.toFixed(0)}%</div>
                  <Slider
                    value={[selectedZoom.position.y]}
                    onValueChange={(value) => handlePositionChange('y', value)}
                    min={10}
                    max={90}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Reset Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUpdateZoom(selectedZoom.id, { 
                zoomLevel: 150, 
                position: { x: 50, y: 50 } 
              })}
              className="w-full bg-gray-600 border-gray-500 hover:bg-gray-500"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset Zoom
            </Button>
          </div>
        </Card>
      )}

      {selectedZoom && (
        <Card className="p-4 bg-gray-700 border-gray-600">
          <h4 className="text-sm font-medium mb-3 text-white">Zoom Center Preview (Drag to Adjust)</h4>
          <div 
            className="relative w-full h-32 bg-black rounded border border-gray-600 overflow-hidden cursor-crosshair"
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
            onMouseLeave={handlePreviewMouseUp}
          >
            <div
              className="absolute w-4 h-4 bg-purple-500 border-2 border-white rounded-full transition-all duration-200 cursor-move"
              style={{
                left: `${selectedZoom.position.x}%`,
                top: `${selectedZoom.position.y}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
            <div className="absolute bottom-2 left-2 text-xs text-gray-400">
              Drag the purple dot to set zoom center
            </div>
            <div className="absolute top-2 right-2 text-xs text-purple-400">
              {selectedZoom.zoomLevel}%
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ZoomControls;