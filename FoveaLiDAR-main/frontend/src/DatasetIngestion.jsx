import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, Database, 
  Layers, HardDrive, Cpu, Compass, Activity, ArrowRight, 
  Clock, ShieldAlert, FileSpreadsheet, Box, RefreshCw
} from 'lucide-react';

const PRESETS = [
  {
    id: 'nuscenes',
    name: 'nuScenes-mini Urban Scan',
    points: '51,200 pts',
    desc: '32-beam automotive LiDAR with drivable surface, pedestrians & vehicles',
    badge: 'Standard nuScenes'
  },
  {
    id: 'dense_benchmark',
    name: 'Dense Arterial Corridor',
    points: '51,200 pts',
    desc: 'High-density multi-lane roadway with multi-height sign gantries & barriers',
    badge: 'Benchmark Reference'
  },
  {
    id: 'highway',
    name: 'SemanticKITTI Highway Slice',
    points: '12,800 pts',
    desc: '64-beam high velocity corridor with roadside terrain & overpasses',
    badge: 'KITTI Spec'
  }
];

export default function DatasetIngestion({ 
  onDatasetLoaded, 
  onRunPipeline, 
  onCompareBenchmark,
  activeInspection, 
  loading, 
  setLoading 
}) {
  const [activeTab, setActiveTab] = useState('csv');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setErrorMsg(null);
    setLoading(true);
    setSelectedFile(file);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/dataset/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to inspect dataset file');
      }

      const data = await res.json();
      onDatasetLoaded(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = async (presetId) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/dataset/select-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to load system dataset');
      }

      const data = await res.json();
      onDatasetLoaded(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-[#111820] border border-[#26333F] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26333F] pb-3 mb-4">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-widest text-[#59C1B0] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#59C1B0]" />
              LiDAR Dataset Ingestion Engine
            </h2>
            <p className="text-xs text-[#8593A1] mt-0.5">
              Select an input source for automated telemetry inspection and variable-resolution mapping
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[#0B1016] p-1 rounded-md border border-[#26333F]">
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'csv' 
                  ? 'bg-[#59C1B0] text-[#0B1016] font-bold shadow' 
                  : 'text-[#8593A1] hover:text-[#E7EDF2]'
              }`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setActiveTab('las')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'las' 
                  ? 'bg-[#59C1B0] text-[#0B1016] font-bold shadow' 
                  : 'text-[#8593A1] hover:text-[#E7EDF2]'
              }`}
            >
              LAS / LAZ
              <span className="text-[10px] px-1 rounded bg-[#26333F] text-[#E3B23C]">Soon</span>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'system' 
                  ? 'bg-[#59C1B0] text-[#0B1016] font-bold shadow' 
                  : 'text-[#8593A1] hover:text-[#E7EDF2]'
              }`}
            >
              System Datasets
            </button>
            <button
              onClick={() => setActiveTab('dragdrop')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'dragdrop' 
                  ? 'bg-[#59C1B0] text-[#0B1016] font-bold shadow' 
                  : 'text-[#8593A1] hover:text-[#E7EDF2]'
              }`}
            >
              Drag & Drop
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-[#FF5C6C]/10 border border-[#FF5C6C]/30 rounded text-xs text-[#FF5C6C] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {activeTab === 'csv' && (
          <div className="space-y-3">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#26333F] hover:border-[#59C1B0] bg-[#0F151C] rounded-lg p-6 text-center cursor-pointer transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xyz,.tsv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                }}
              />
              <FileSpreadsheet className="w-10 h-10 text-[#8593A1] group-hover:text-[#59C1B0] mx-auto mb-2 transition-colors" />
              <div className="text-xs font-mono text-[#E7EDF2] font-semibold">
                Click to browse or drop a point-cloud file
              </div>
              <div className="text-[11px] text-[#8593A1] mt-1">
                Supports .csv, .xlsx, .xls, .xyz, .tsv — auto-resolves X, Y, Z, intensity and classification headers
              </div>
            </div>
          </div>
        )}

        {activeTab === 'las' && (
          <div className="border border-[#26333F] bg-[#0F151C] rounded-lg p-6 text-center space-y-3">
            <Box className="w-10 h-10 text-[#E3B23C] mx-auto opacity-80" />
            <div className="text-xs font-mono text-[#E7EDF2] font-bold tracking-wide">
              ASPRS LAS / Compressed LAZ Ingestion
            </div>
            <p className="text-xs text-[#8593A1] max-w-md mx-auto">
              Binary LAS 1.2/1.4 and LAZ decompression pipeline is currently staged for PointNet batch processing.
            </p>
            <div className="inline-block px-2.5 py-1 rounded bg-[#E3B23C]/10 text-[#E3B23C] text-[11px] font-mono border border-[#E3B23C]/30">
              Upload CSV / LAS · Coming soon
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRESETS.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelectPreset(p.id)}
                className="border border-[#26333F] hover:border-[#59C1B0] bg-[#0F151C] p-3 rounded-lg cursor-pointer transition-colors group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-[#E7EDF2] font-semibold group-hover:text-[#59C1B0] transition-colors">
                      {p.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#26333F] text-[#59C1B0]">
                      {p.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8593A1] leading-relaxed">
                    {p.desc}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#26333F] flex items-center justify-between text-[11px] font-mono text-[#5B6672]">
                  <span>{p.points}</span>
                  <span className="text-[#59C1B0] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Load Scan <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dragdrop' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver 
                ? 'border-[#59C1B0] bg-[#59C1B0]/10' 
                : 'border-[#26333F] bg-[#0F151C]'
            }`}
          >
            <Upload className={`w-10 h-10 mx-auto mb-2 ${dragOver ? 'text-[#59C1B0]' : 'text-[#8593A1]'}`} />
            <div className="text-xs font-mono text-[#E7EDF2] font-semibold">
              Drag and drop any LiDAR dataset here
            </div>
            <div className="text-[11px] text-[#8593A1] mt-1">
              Supports .csv, .xyz, .ply formats up to 100,000 points
            </div>
          </div>
        )}
      </div>

      {activeInspection && (
        <div className="bg-[#111820] border border-[#26333F] rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26333F] pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#59C1B0]" />
              <div>
                <h3 className="text-xs font-mono uppercase tracking-widest text-[#E7EDF2] font-bold">
                  Dataset Telemetry & Quality Summary
                </h3>
                <span className="text-[11px] font-mono text-[#8593A1]">
                  Target: {activeInspection.filename} ({activeInspection.file_type})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                activeInspection.data_quality_score >= 90
                  ? 'bg-[#59C1B0]/10 text-[#59C1B0] border-[#59C1B0]/30'
                  : 'bg-[#E3B23C]/10 text-[#E3B23C] border-[#E3B23C]/30'
              }`}>
                <Activity className="w-3.5 h-3.5" />
                Quality: {activeInspection.data_quality_score}%
              </span>

              <button
                onClick={onRunPipeline}
                disabled={loading}
                className="px-4 py-1.5 bg-[#59C1B0] hover:bg-[#4ea899] text-[#0B1016] text-xs font-mono font-bold rounded flex items-center gap-1.5 transition-colors shadow"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                Run Pipeline on Dataset
              </button>

              {onCompareBenchmark && (
                <button
                  onClick={onCompareBenchmark}
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-[#111820] hover:bg-[#1c2631] text-[#59C1B0] border border-[#59C1B0]/50 text-xs font-mono font-bold rounded flex items-center gap-1.5 transition-colors shadow"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Compare & Benchmark
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-[#0B1016] p-2.5 rounded border border-[#26333F]">
              <div className="text-[10px] text-[#8593A1] uppercase tracking-wider">Point Count</div>
              <div className="text-sm text-[#E7EDF2] font-bold mt-0.5">
                {activeInspection.point_count.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#5B6672] mt-0.5">
                Size: {activeInspection.file_size_kb} KB
              </div>
            </div>

            <div className="bg-[#0B1016] p-2.5 rounded border border-[#26333F]">
              <div className="text-[10px] text-[#8593A1] uppercase tracking-wider">Point Density</div>
              <div className="text-sm text-[#E7EDF2] font-bold mt-0.5">
                {activeInspection.point_density_pts_m2} pts/m²
              </div>
              <div className="text-[10px] text-[#5B6672] mt-0.5">
                Vol: {activeInspection.bounding_box_volume_m3.toLocaleString()} m³
              </div>
            </div>

            <div className="bg-[#0B1016] p-2.5 rounded border border-[#26333F]">
              <div className="text-[10px] text-[#8593A1] uppercase tracking-wider">Coordinate System</div>
              <div className="text-sm text-[#E7EDF2] font-bold mt-0.5 truncate" title={activeInspection.crs_detected}>
                {activeInspection.crs_detected}
              </div>
              <div className="text-[10px] text-[#59C1B0] mt-0.5">
                Units: {activeInspection.units_detected}
              </div>
            </div>

            <div className="bg-[#0B1016] p-2.5 rounded border border-[#26333F]">
              <div className="text-[10px] text-[#8593A1] uppercase tracking-wider">Missing & Duplicates</div>
              <div className="text-sm text-[#E7EDF2] font-bold mt-0.5">
                {activeInspection.missing_values} NaNs
              </div>
              <div className="text-[10px] text-[#5B6672] mt-0.5">
                {activeInspection.duplicate_points} Duplicates
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[#0B1016] p-3 rounded border border-[#26333F] space-y-2">
              <div className="text-[11px] font-bold text-[#E7EDF2] flex items-center justify-between">
                <span>Channel & Attribute Availability</span>
                <span className="text-[10px] text-[#8593A1]">3D Structure</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between p-1.5 bg-[#111820] rounded border border-[#26333F]/50">
                  <span className="text-[#8593A1]">X, Y, Z Coords</span>
                  <span className={activeInspection.has_xyz ? 'text-[#59C1B0] font-bold' : 'text-[#FF5C6C]'}>
                    {activeInspection.has_xyz ? 'Available' : 'Missing'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-[#111820] rounded border border-[#26333F]/50">
                  <span className="text-[#8593A1]">Intensity Channel</span>
                  <span className={activeInspection.has_intensity ? 'text-[#59C1B0] font-bold' : 'text-[#5B6672]'}>
                    {activeInspection.has_intensity ? 'Available' : 'Synthetic'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-[#111820] rounded border border-[#26333F]/50">
                  <span className="text-[#8593A1]">Semantic Labels</span>
                  <span className={activeInspection.has_labels ? 'text-[#59C1B0] font-bold' : 'text-[#5B6672]'}>
                    {activeInspection.has_labels ? 'Provided' : 'Heuristic'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-[#111820] rounded border border-[#26333F]/50">
                  <span className="text-[#8593A1]">Spatial Extent</span>
                  <span className="text-[#E7EDF2] font-mono text-[10px]">
                    X:[{activeInspection.spatial_extent.x[0]}, {activeInspection.spatial_extent.x[1]}]
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#0B1016] p-3 rounded border border-[#26333F] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-[#E7EDF2] flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#59C1B0]" />
                  PointNet Suitability Verdict
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${
                  activeInspection.is_pointnet_suitable 
                    ? 'bg-[#59C1B0]/20 text-[#59C1B0] border border-[#59C1B0]/30' 
                    : 'bg-[#FF5C6C]/20 text-[#FF5C6C] border border-[#FF5C6C]/30'
                }`}>
                  {activeInspection.is_pointnet_suitable ? 'SUITABLE' : 'UNSUITABLE'}
                </span>
              </div>
              <ul className="space-y-1 text-[11px] text-[#8593A1]">
                {activeInspection.pointnet_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#59C1B0] mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
