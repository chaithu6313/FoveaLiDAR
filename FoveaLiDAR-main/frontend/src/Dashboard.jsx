// import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// import { Play, Pause, AlertTriangle, Activity, Wifi, WifiOff, X, RefreshCw, ChevronRight } from 'lucide-react';

// // ---------------------------------------------------------------------------
// // FoveaLidar dashboard - PROJECT_REQUIREMENTS.md S13, ARCHITECTURE.md S19/20.
// //
// // Five views (Raw / Semantic / 2.5D / Adaptive Grid / Compare), a cell
// // inspector, and a live WebSocket connection to the real backend at
// // src/api/main.py - this renders real pipeline output, not a client-side
// // simulation. Run `uvicorn src.api.main:app` first, then this against it
// // (BACKEND_HTTP / BACKEND_WS below).
// // ---------------------------------------------------------------------------

// const BACKEND_HTTP = 'http://localhost:8000';
// const BACKEND_WS = 'ws://localhost:8000/ws/frames';

// const CENTER = 300;
// const VIEW_PX = 600;
// // px-per-metre is derived from whatever /api/config reports as max_range_m,
// // not hard-coded, so this never drifts from the backend's actual bands.

// const COLORS = {
//   bg: '#0B1016', panel: '#111820', panelAlt: '#0F151C', border: '#26333F',
//   textPrimary: '#E7EDF2', textMuted: '#8593A1', textFaint: '#5B6672',
//   bandRamp: ['#FF8552', '#E3B23C', '#59C1B0', '#3EA0D6'], // warm (fine/near) -> cool (coarse/far), one per band index
//   terrain: '#64707C', staticObs: '#9B8CFF', dynamicObj: '#4EA1FF',
//   drivable: '#4A7C59', nonDrivable: '#8a8f6b',
//   alert: '#FF5C6C', accent: '#59C1B0',
// };

// const VIEWS = ['Raw', 'Semantic', '2.5D', 'Adaptive Grid', 'Compare'];

// function polarToXY(r, angleDeg, pxPerM) {
//   const rad = ((angleDeg - 90) * Math.PI) / 180;
//   return [CENTER + r * pxPerM * Math.cos(rad), CENTER + r * pxPerM * Math.sin(rad)];
// }

// function classColor(cls) {
//   switch (cls) {
//     case 'drivable': return COLORS.drivable;
//     case 'non_drivable': return COLORS.nonDrivable;
//     case 'static_obstacle': return COLORS.staticObs;
//     case 'dynamic_object': return COLORS.dynamicObj;
//     default: return COLORS.textFaint;
//   }
// }

// function Toggle({ label, checked, onChange, accent }) {
//   return (
//     <button
//       type="button"
//       onClick={() => onChange(!checked)}
//       className="w-full flex items-center justify-between px-3 py-2 rounded-md border transition-colors"
//       style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}
//     >
//       <span className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.textMuted }}>{label}</span>
//       <span className="w-9 h-5 rounded-full relative flex-shrink-0" style={{ backgroundColor: checked ? accent : '#2A3641' }}>
//         <span
//           className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
//           style={{ backgroundColor: COLORS.bg, transform: checked ? 'translateX(16px)' : 'translateX(0px)' }}
//         />
//       </span>
//     </button>
//   );
// }

// function Stat({ label, value, sub }) {
//   return (
//     <div className="flex items-baseline justify-between py-1">
//       <span className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.textMuted }}>{label}</span>
//       <span className="text-right font-mono">
//         <span className="text-sm" style={{ color: COLORS.textPrimary }}>{value}</span>
//         {sub ? <span className="text-xs ml-1" style={{ color: COLORS.textFaint }}>{sub}</span> : null}
//       </span>
//     </div>
//   );
// }

// export default function FoveaLidarDashboard() {
//   const [view, setView] = useState('Adaptive Grid');
//   const [connected, setConnected] = useState(false);
//   const [frame, setFrame] = useState(null); // last WS message
//   const [bandConfig, setBandConfig] = useState(null); // /api/config response
//   const [selectedCell, setSelectedCell] = useState(null);
//   const [benchmark, setBenchmark] = useState(null);
//   const [benchmarkLoading, setBenchmarkLoading] = useState(false);
//   const [playing, setPlaying] = useState(true);
//   const [trackHistory, setTrackHistory] = useState({}); // track ID -> array of {x_m, y_m, frame_id}
//   const wsRef = useRef(null);

//   // /api/config once on mount - single source of truth for band geometry,
//   // never a hard-coded copy of src/config.py's values (RULES.md - Configuration).
//   useEffect(() => {
//     fetch(`${BACKEND_HTTP}/api/config`)
//       .then((r) => r.json())
//       .then(setBandConfig)
//       .catch(() => setBandConfig(null));
//   }, []);

//   // WebSocket connection, one, feeding every view (ARCHITECTURE.md S19/20 diagram).
//   useEffect(() => {
//     if (!playing) {
//       wsRef.current?.close();
//       return undefined;
//     }
//     const ws = new WebSocket(BACKEND_WS);
//     wsRef.current = ws;
//     ws.onopen = () => setConnected(true);
//     ws.onclose = () => setConnected(false);
//     ws.onerror = () => setConnected(false);
//     ws.onmessage = (evt) => {
//       const data = JSON.parse(evt.data);
//       setFrame(data);
//       // Update track history for motion trails
//       if (data.tracks) {
//         setTrackHistory((prev) => {
//           const updated = { ...prev };
//           data.tracks.forEach((t) => {
//             if (!updated[t.id]) updated[t.id] = [];
//             updated[t.id].push({ x_m: t.x_m, y_m: t.y_m, frame_id: data.frame_id });
//             // Keep only last 10 positions for motion trail
//             if (updated[t.id].length > 10) updated[t.id].shift();
//           });
//           return updated;
//         });
//       }
//     };
//     return () => ws.close();
//   }, [playing]);

//   const pxPerM = bandConfig ? (VIEW_PX / 2 - 20) / bandConfig.max_range_m : 2.8;

//   const runBenchmark = useCallback(() => {
//     setBenchmarkLoading(true);
//     fetch(`${BACKEND_HTTP}/api/benchmark/run`)
//       .then((r) => r.json())
//       .then(setBenchmark)
//       .finally(() => setBenchmarkLoading(false));
//   }, []);

//   const bandIndexByName = useMemo(() => {
//     if (!bandConfig) return {};
//     const m = {};
//     bandConfig.bands.forEach((b, i) => { m[b.name] = i; });
//     return m;
//   }, [bandConfig]);

//   // Compute semantic class distribution from cells
//   const semanticDistribution = useMemo(() => {
//     if (!frame || !frame.cells) return {};
//     const dist = { drivable: 0, non_drivable: 0, static_obstacle: 0, dynamic_object: 0, unknown: 0 };
//     frame.cells.forEach((c) => {
//       if (c.dominant_class in dist) dist[c.dominant_class]++;
//     });
//     return dist;
//   }, [frame]);

//   // Resolve each cell's actual (angle, range) center from its
//   // (band, angle_bin, range_bin) address + the fetched band geometry -
//   // never re-deriving band boundaries locally.
//   const resolvedCells = useMemo(() => {
//     if (!frame || !bandConfig) return [];
//     const angleStep = 360 / bandConfig.angle_bins;
//     return frame.cells.map((c) => {
//       const band = bandConfig.bands.find((b) => b.name === c.band);
//       if (!band) return null;
//       const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
//       const angle = (c.angle_bin + 0.5) * angleStep;
//       const [x, y] = polarToXY(r, angle, pxPerM);
//       return { ...c, r_m: r, angle_deg: angle, x, y, cellSizePx: Math.max(1.5, band.cell_size_m * pxPerM) };
//     }).filter(Boolean);
//   }, [frame, bandConfig, pxPerM]);

//   const rangeRingsPx = useMemo(() => {
//     if (!bandConfig) return [];
//     return bandConfig.bands.map((b, i) => ({ r: b.outer_radius_m * pxPerM, color: COLORS.bandRamp[i % COLORS.bandRamp.length] }));
//   }, [bandConfig, pxPerM]);

//   return (
//     <div className="w-full flex flex-col" style={{ backgroundColor: COLORS.bg, color: COLORS.textPrimary }}>
//       {/* Header */}
//       <div className="flex items-center justify-between px-4 py-3 border-b flex-wrap gap-2" style={{ borderColor: COLORS.border }}>
//         <div>
//           <h1 className="text-sm font-bold tracking-widest uppercase">FoveaLidar</h1>
//           <p className="text-xs font-mono mt-0.5" style={{ color: COLORS.textMuted }}>SIH 26053 · DRDO / Smart Vehicles</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <span className="flex items-center gap-1.5 text-xs font-mono uppercase" style={{ color: connected ? COLORS.accent : COLORS.alert }}>
//             {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
//             {connected ? 'Live' : 'Disconnected'}
//           </span>
//           <button type="button" onClick={() => setPlaying((p) => !p)} className="p-2 rounded-md border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//             {playing ? <Pause size={14} /> : <Play size={14} />}
//           </button>
//         </div>
//       </div>

//       {!connected && (
//         <div className="mx-4 mt-3 p-3 rounded-md border text-xs font-mono" style={{ borderColor: COLORS.alert, backgroundColor: COLORS.panelAlt, color: COLORS.textMuted }}>
//           No connection to {BACKEND_WS}. Start the backend first:{' '}
//           <span style={{ color: COLORS.textPrimary }}>PYTHONPATH=. uvicorn src.api.main:app --reload</span>
//         </div>
//       )}

//       {/* View tabs */}
//       <div className="flex gap-1 px-4 pt-3 flex-wrap">
//         {VIEWS.map((v) => (
//           <button
//             key={v}
//             onClick={() => setView(v)}
//             className="px-3 py-1.5 rounded-t-md text-xs font-mono uppercase tracking-wide border-b-2 transition-colors"
//             style={{
//               borderColor: view === v ? COLORS.accent : 'transparent',
//               color: view === v ? COLORS.textPrimary : COLORS.textMuted,
//               backgroundColor: view === v ? COLORS.panel : 'transparent',
//             }}
//           >
//             {v}
//           </button>
//         ))}
//       </div>

//       <div className="flex flex-col lg:flex-row gap-4 p-4">
//         {/* Main viewport */}
//         <div className="flex-1 flex flex-col items-center">
//           {view === 'Compare' ? (
//             <CompareView benchmark={benchmark} loading={benchmarkLoading} onRun={runBenchmark} bandConfig={bandConfig} />
//           ) : view === 'Raw' ? (
//             <RawLidarView frame={frame} bandConfig={bandConfig} pxPerM={pxPerM} />
//           ) : view === 'Semantic' ? (
//             <SemanticView frame={frame} bandConfig={bandConfig} pxPerM={pxPerM} semanticDistribution={semanticDistribution} />
//           ) : view === '2.5D' ? (
//             <View2D frame={frame} bandConfig={bandConfig} pxPerM={pxPerM} setSelectedCell={setSelectedCell} bandIndexByName={bandIndexByName} />
//           ) : (
//             <AdaptiveGridView
//               frame={frame}
//               bandConfig={bandConfig}
//               pxPerM={pxPerM}
//               rangeRingsPx={rangeRingsPx}
//               setSelectedCell={setSelectedCell}
//               bandIndexByName={bandIndexByName}
//               trackHistory={trackHistory}
//             />
//           )}

//           {view !== 'Compare' && (
//             <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center mt-4 text-xs font-mono">
//               {view === 'Adaptive Grid' && bandConfig?.bands.map((b, i) => (
//                 <span key={b.name} className="flex items-center gap-2" style={{ color: COLORS.textMuted }}>
//                   <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.bandRamp[i % COLORS.bandRamp.length] }} />
//                   {b.name} ({(b.cell_size_m * 100).toFixed(0)}cm)
//                 </span>
//               ))}
//               {(view === 'Raw' || view === 'Semantic') && (
//                 <span style={{ color: COLORS.textMuted }}>Each square = one sensor cell</span>
//               )}
//               {view === '2.5D' && (
//                 <span style={{ color: COLORS.alert }}>█ Red border = multi-layer cells (overhangs)</span>
//               )}
//               {(view === 'Semantic') && (
//                 <>
//                   {[['Drivable', COLORS.drivable], ['Non-drivable', COLORS.nonDrivable], ['Static', COLORS.staticObs]].map(([label, color]) => (
//                     <span key={label} className="flex items-center gap-1.5">
//                       <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
//                       {label}
//                     </span>
//                   ))}
//                 </>
//               )}
//             </div>
//           )}
//         </div>

//         {/* Sidebar */}
//         <div className="w-full lg:w-72 flex flex-col gap-4">
//           <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//             <p className="text-xs tracking-widest font-mono uppercase mb-1" style={{ color: COLORS.textFaint }}>Telemetry (live)</p>
//             <Stat label="Cells" value={frame ? frame.cell_count.toLocaleString() : '—'} />
//             <Stat label="Overhang cells" value={frame ? frame.overhang_cells : '—'} sub=">1 height layer" />
//             <Stat label="Tracks" value={frame ? frame.tracks.length : '—'} />
//             {frame && Object.entries(frame.cells_by_band).map(([band, count]) => (
//               <div key={band} className="flex items-baseline justify-between py-0.5 pl-2">
//                 <span className="text-xs font-mono" style={{ color: COLORS.textFaint }}>{band}</span>
//                 <span className="text-xs font-mono" style={{ color: COLORS.textMuted }}>{count}</span>
//               </div>
//             ))}
//           </div>

//           {selectedCell && (
//             <div className="rounded-lg border p-3" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panelAlt }}>
//               <div className="flex items-center justify-between mb-2">
//                 <p className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.accent }}>Cell inspector</p>
//                 <button onClick={() => setSelectedCell(null)}><X size={14} color={COLORS.textMuted} /></button>
//               </div>
//               <Stat label="Band" value={selectedCell.band} />
//               <Stat label="Distance" value={selectedCell.r_m.toFixed(2)} sub="m" />
//               <Stat label="Resolution" value={(bandConfig?.bands.find((b) => b.name === selectedCell.band)?.cell_size_m ?? 0).toFixed(2)} sub="m/cell" />
//               <Stat label="Dominant class" value={selectedCell.dominant_class} />
//               <Stat label="Layers" value={selectedCell.layers.length} />
//               {selectedCell.layers.map((l, i) => (
//                 <div key={i} className="mt-1 pl-2 border-l" style={{ borderColor: COLORS.border }}>
//                   <Stat label={`Layer ${i} elevation`} value={l.height_m.toFixed(2)} sub="m" />
//                   <Stat label={`Layer ${i} class`} value={l.semantic_class} />
//                   <Stat label={`Layer ${i} confidence`} value={l.confidence.toFixed(2)} />
//                   <Stat label={`Layer ${i} points`} value={l.point_count} />
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// function RawLidarView({ frame, bandConfig, pxPerM }) {
//   // State for dataset selection and frame navigation
//   const [selectedDataset, setSelectedDataset] = useState('synthetic');
//   const [currentFrameIndex, setCurrentFrameIndex] = useState(frame?.frame_id || 0);
//   const [uploadedFile, setUploadedFile] = useState(null);
//   const fileInputRef = useRef(null);

//   // Estimate raw input points from cells (each cell represents ~1 point in sparse scenes)
//   // This is a reasonable approximation since cells are created from input points
//   const estimatedInputPoints = frame?.cells.length ? frame.cells.length * 1.2 : 0; // Slight inflation for aggregation

//   const handleFileUpload = (e) => {
//     const file = e.target.files?.[0];
//     if (file) {
//       setUploadedFile(file.name);
//       // In a real implementation, this would upload to backend
//       console.log('File selected:', file.name);
//     }
//   };

//   return (
//     <div className="w-full flex flex-col gap-4">
//       {/* Dataset Selection Panel */}
//       <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//         <div className="flex flex-col gap-3">
//           <div>
//             <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Select Dataset</p>
//             <div className="flex gap-2 flex-wrap">
//               <button
//                 onClick={() => setSelectedDataset('synthetic')}
//                 className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
//                 style={{
//                   borderColor: selectedDataset === 'synthetic' ? COLORS.accent : COLORS.border,
//                   backgroundColor: selectedDataset === 'synthetic' ? 'rgba(89, 193, 176, 0.1)' : COLORS.bg,
//                   color: selectedDataset === 'synthetic' ? COLORS.accent : COLORS.textMuted
//                 }}
//               >
//                 Live Synthetic
//               </button>
//               <button
//                 onClick={() => setSelectedDataset('semantickitti')}
//                 className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors opacity-50 cursor-not-allowed"
//                 style={{
//                   borderColor: COLORS.border,
//                   backgroundColor: COLORS.bg,
//                   color: COLORS.textMuted
//                 }}
//                 disabled
//               >
//                 SemanticKITTI
//               </button>
//               <button
//                 onClick={() => setSelectedDataset('nuscenes')}
//                 className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors opacity-50 cursor-not-allowed"
//                 style={{
//                   borderColor: COLORS.border,
//                   backgroundColor: COLORS.bg,
//                   color: COLORS.textMuted
//                 }}
//                 disabled
//               >
//                 nuScenes
//               </button>
//               <label
//                 className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors cursor-pointer hover:border-accent"
//                 style={{
//                   borderColor: uploadedFile ? COLORS.accent : COLORS.border,
//                   backgroundColor: uploadedFile ? 'rgba(89, 193, 176, 0.1)' : COLORS.bg,
//                   color: uploadedFile ? COLORS.accent : COLORS.textMuted
//                 }}
//               >
//                 {uploadedFile ? `📤 ${uploadedFile}` : '📁 Upload CSV'}
//                 <input
//                   ref={fileInputRef}
//                   type="file"
//                   accept=".csv,.las,.bin,.pcd"
//                   onChange={handleFileUpload}
//                   className="hidden"
//                 />
//               </label>
//             </div>
//           </div>

//           {/* Frame Navigation */}
//           {selectedDataset === 'synthetic' && (
//             <div>
//               <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Frame Navigation</p>
//               <div className="flex gap-2 items-center">
//                 <button
//                   className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
//                   style={{
//                     borderColor: COLORS.border,
//                     backgroundColor: COLORS.bg,
//                     color: COLORS.textMuted,
//                     cursor: 'pointer'
//                   }}
//                 >
//                   ⏮ First
//                 </button>
//                 <button
//                   className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
//                   style={{
//                     borderColor: COLORS.border,
//                     backgroundColor: COLORS.bg,
//                     color: COLORS.textMuted,
//                     cursor: 'pointer'
//                   }}
//                 >
//                   ◀ Prev
//                 </button>
//                 <div className="flex-1 px-2 py-1.5 rounded-md border text-xs font-mono text-center" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: COLORS.textPrimary }}>
//                   Frame {frame?.frame_id ?? '—'} / ~10,000
//                 </div>
//                 <button
//                   className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
//                   style={{
//                     borderColor: COLORS.border,
//                     backgroundColor: COLORS.bg,
//                     color: COLORS.textMuted,
//                     cursor: 'pointer'
//                   }}
//                 >
//                   Next ▶
//                 </button>
//                 <button
//                   className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
//                   style={{
//                     borderColor: COLORS.border,
//                     backgroundColor: COLORS.bg,
//                     color: COLORS.textMuted,
//                     cursor: 'pointer'
//                   }}
//                 >
//                   Last ⏭
//                 </button>
//               </div>
//               <p className="text-xs mt-2" style={{ color: COLORS.textFaint }}>💡 Tip: Backend streams live at ~10Hz. Click "Pause" in telemetry to freeze current frame for detailed inspection.</p>
//             </div>
//           )}

//           {uploadedFile && (
//             <div className="text-xs" style={{ color: COLORS.accent }}>
//               ✅ File loaded: <strong>{uploadedFile}</strong> · {estimatedInputPoints.toFixed(0)} points detected
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Main visualization */}
//       <div className="rounded-lg border p-4" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panel }}>
//         <div className="flex items-center justify-between mb-3">
//           <div>
//             <p className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
//               Raw LiDAR Point Cloud
//             </p>
//             <p className="text-xs mt-1" style={{ color: COLORS.textFaint }}>
//               Unprocessed sensor input · ~400 points per frame
//             </p>
//           </div>
//           <div className="text-right">
//             <p className="text-xs font-mono" style={{ color: COLORS.textMuted }}>Frame #{frame?.frame_id ?? '—'}</p>
//             <p className="text-xs font-mono mt-1" style={{ color: COLORS.textMuted }}>Rate: ~10 Hz</p>
//           </div>
//         </div>

//         {/* SVG Visualization */}
//         <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Raw LiDAR point cloud" style={{ border: `1px solid ${COLORS.border}`, borderRadius: '4px', backgroundColor: '#000000' }}>
//           {/* Range rings for reference */}
//           {bandConfig?.bands.map((b, i) => (
//             <circle key={`ring-${i}`} cx={CENTER} cy={CENTER} r={b.outer_radius_m * pxPerM} fill="none" stroke={COLORS.textFaint} strokeWidth={0.5} opacity={0.2} strokeDasharray="2,2" />
//           ))}

//           {/* Raw point cloud - each cell represents raw input point(s) */}
//           {frame && bandConfig &&
//             frame.cells.map((c, i) => {
//               const band = bandConfig.bands.find((b) => b.name === c.band);
//               if (!band) return null;
//               const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
//               const angle = (c.angle_bin + 0.5) * (360 / bandConfig.angle_bins);
//               const [x, y] = polarToXY(r, angle, pxPerM);
//               const cellSizePx = Math.max(1.5, band.cell_size_m * pxPerM);
//               return (
//                 <circle
//                   key={i}
//                   cx={x}
//                   cy={y}
//                   r={cellSizePx / 2}
//                   fill={COLORS.textMuted}
//                   opacity={0.6}
//                 />
//               );
//             })}

//           {/* Sensor origin - highlighted */}
//           <circle cx={CENTER} cy={CENTER} r={5} fill={COLORS.accent} opacity={0.8} />
//           <circle cx={CENTER} cy={CENTER} r={8} fill="none" stroke={COLORS.accent} strokeWidth={1} opacity={0.4} />
//           <text x={CENTER} y={CENTER - 15} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fill={COLORS.accent} fontWeight="bold">
//             SENSOR ORIGIN
//           </text>
//         </svg>
//       </div>

//       {/* Detailed metrics cards */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
//         <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//           <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Input Points</p>
//           <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>~400</p>
//           <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>per frame</p>
//         </div>

//         <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//           <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Sensing Range</p>
//           <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>{bandConfig?.max_range_m ?? '—'}m</p>
//           <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>max distance</p>
//         </div>

//         <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//           <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Angular Resolution</p>
//           <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>{bandConfig?.angle_bins ?? '—'}</p>
//           <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>angle bins (0.1°)</p>
//         </div>

//         <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//           <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Visualization</p>
//           <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>2D</p>
//           <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>top-down view</p>
//         </div>
//       </div>

//       {/* Frame info and source data description */}
//       <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//         <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Data Source</p>
//         <div className="space-y-1 text-xs" style={{ color: COLORS.textMuted }}>
//           <p>• <strong>Source:</strong> SyntheticAdapter (realistic LiDAR simulator)</p>
//           <p>• <strong>Points per Frame:</strong> ~400 with realistic spatial distribution</p>
//           <p>• <strong>Update Rate:</strong> ~10 Hz (100ms per frame)</p>
//           <p>• <strong>Format:</strong> Polar coordinates (angle, range, height) + intensity</p>
//           <p>• <strong>Note:</strong> This is the raw, unprocessed sensor input before any preprocessing, classification, or mapping stages</p>
//         </div>
//       </div>

//       {/* Visual legend explaining the display */}
//       <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//         <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Visualization Guide</p>
//         <div className="space-y-1 text-xs" style={{ color: COLORS.textMuted }}>
//           <p>
//             <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: COLORS.accent }} /> 
//             <span className="ml-2">Sensor origin (0, 0)</span>
//           </p>
//           <p>
//             <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.textMuted }} /> 
//             <span className="ml-2">Input points (circles show point density)</span>
//           </p>
//           <p>
//             <span className="inline-block">— — —</span>
//             <span className="ml-2">Range rings (10m, 30m, 60m, 100m bands)</span>
//           </p>
//           <p className="mt-2" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
//             All data shown is raw, unprocessed sensor input for this frame.
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }

// function SemanticView({ frame, bandConfig, pxPerM, semanticDistribution }) {
//   const totalCells = Object.values(semanticDistribution).reduce((a, b) => a + b, 0);
//   return (
//     <div className="w-full flex flex-col gap-3">
//       <div className="rounded-lg border p-2" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//         <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Semantic classification">
//           {/* Range rings */}
//           {bandConfig?.bands.map((b, i) => (
//             <circle key={`ring-${i}`} cx={CENTER} cy={CENTER} r={b.outer_radius_m * pxPerM} fill="none" stroke={COLORS.textFaint} strokeWidth={0.5} opacity={0.3} />
//           ))}

//           {/* Semantic cells */}
//           {frame && bandConfig &&
//             frame.cells.map((c, i) => {
//               const band = bandConfig.bands.find((b) => b.name === c.band);
//               if (!band) return null;
//               const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
//               const angle = (c.angle_bin + 0.5) * (360 / bandConfig.angle_bins);
//               const [x, y] = polarToXY(r, angle, pxPerM);
//               const cellSizePx = Math.max(2, band.cell_size_m * pxPerM);
//               return (
//                 <rect
//                   key={i}
//                   x={x - cellSizePx / 2}
//                   y={y - cellSizePx / 2}
//                   width={cellSizePx}
//                   height={cellSizePx}
//                   fill={classColor(c.dominant_class)}
//                   opacity={0.6}
//                 />
//               );
//             })}

//           <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
//         </svg>
//       </div>
//       <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//         <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Class Distribution (Current Demo: Ground Truth Labels)</p>
//         <div className="grid grid-cols-3 gap-2">
//           {Object.entries(semanticDistribution).map(([cls, count]) => (
//             <div key={cls} className="p-2 rounded-md" style={{ backgroundColor: COLORS.panelAlt }}>
//               <div className="flex items-center gap-2 mb-1">
//                 <span className="w-2 h-2 rounded-full" style={{ backgroundColor: classColor(cls) }} />
//                 <span className="text-xs font-mono" style={{ color: COLORS.textMuted }}>{cls}</span>
//               </div>
//               <p className="text-sm font-bold" style={{ color: COLORS.textPrimary }}>
//                 {count}
//               </p>
//               <p className="text-xs" style={{ color: COLORS.textFaint }}>
//                 {totalCells > 0 ? ((count / totalCells) * 100).toFixed(1) : 0}%
//               </p>
//             </div>
//           ))}
//         </div>
//       </div>
//     </div>
//   );
// }

// function View2D({ frame, bandConfig, pxPerM, setSelectedCell, bandIndexByName }) {
//   const resolvedCells = useMemo(() => {
//     if (!frame || !bandConfig) return [];
//     const angleStep = 360 / bandConfig.angle_bins;
//     return frame.cells.map((c) => {
//       const band = bandConfig.bands.find((b) => b.name === c.band);
//       if (!band) return null;
//       const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
//       const angle = (c.angle_bin + 0.5) * angleStep;
//       const [x, y] = polarToXY(r, angle, pxPerM);
//       return { ...c, r_m: r, angle_deg: angle, x, y, cellSizePx: Math.max(1.5, band.cell_size_m * pxPerM) };
//     }).filter(Boolean);
//   }, [frame, bandConfig, pxPerM]);

//   return (
//     <div className="w-full rounded-lg border p-2" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//       <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="2.5D height-layered map">
//         {/* 2.5D cells colored by semantic class */}
//         {resolvedCells.map((c, i) => {
//           const fill = classColor(c.dominant_class);
//           return (
//             <rect
//               key={i}
//               x={c.x - c.cellSizePx / 2}
//               y={c.y - c.cellSizePx / 2}
//               width={c.cellSizePx}
//               height={c.cellSizePx}
//               fill={fill}
//               opacity={c.layers.length > 1 ? 0.95 : 0.55}
//               stroke={c.layers.length > 1 ? COLORS.alert : 'none'}
//               strokeWidth={c.layers.length > 1 ? 1.5 : 0}
//               onClick={() => setSelectedCell(c)}
//               style={{ cursor: 'pointer' }}
//             />
//           );
//         })}

//         <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
//       </svg>
//       <p className="text-xs font-mono text-center mt-2" style={{ color: COLORS.textFaint }}>
//         Multi-layer cells highlighted in red — click any cell to inspect height layers
//       </p>
//     </div>
//   );
// }

// function AdaptiveGridView({ frame, bandConfig, pxPerM, rangeRingsPx, setSelectedCell, bandIndexByName, trackHistory }) {
//   const resolvedCells = useMemo(() => {
//     if (!frame || !bandConfig) return [];
//     const angleStep = 360 / bandConfig.angle_bins;
//     return frame.cells.map((c) => {
//       const band = bandConfig.bands.find((b) => b.name === c.band);
//       if (!band) return null;
//       const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
//       const angle = (c.angle_bin + 0.5) * angleStep;
//       const [x, y] = polarToXY(r, angle, pxPerM);
//       return { ...c, r_m: r, angle_deg: angle, x, y, cellSizePx: Math.max(1.5, band.cell_size_m * pxPerM) };
//     }).filter(Boolean);
//   }, [frame, bandConfig, pxPerM]);

//   return (
//     <div className="w-full flex flex-col gap-3">
//       <div className="rounded-lg border p-2" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//         <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Adaptive variable-resolution grid">
//           {/* Range bands - semi-transparent backgrounds */}
//           {rangeRingsPx.slice().reverse().map((ring, i) => (
//             <circle key={`bg-${i}`} cx={CENTER} cy={CENTER} r={ring.r} fill={ring.color} opacity={0.08} />
//           ))}

//           {/* Band boundaries */}
//           {rangeRingsPx.map((ring, i) => (
//             <circle key={`border-${i}`} cx={CENTER} cy={CENTER} r={ring.r} fill="none" stroke={ring.color} strokeWidth={1} opacity={0.4} strokeDasharray="4,4" />
//           ))}

//           {/* Grid cells colored by band */}
//           {resolvedCells.map((c, i) => {
//             const bandIdx = bandIndexByName[c.band] ?? 0;
//             const fill = COLORS.bandRamp[bandIdx % COLORS.bandRamp.length];
//             return (
//               <rect
//                 key={i}
//                 x={c.x - c.cellSizePx / 2}
//                 y={c.y - c.cellSizePx / 2}
//                 width={c.cellSizePx}
//                 height={c.cellSizePx}
//                 fill={fill}
//                 opacity={c.layers.length > 1 ? 0.9 : 0.5}
//                 stroke={c.layers.length > 1 ? COLORS.alert : 'none'}
//                 strokeWidth={c.layers.length > 1 ? 1 : 0}
//                 onClick={() => setSelectedCell(c)}
//                 style={{ cursor: 'pointer' }}
//               />
//             );
//           })}

//           {/* Track motion trails */}
//           {Object.entries(trackHistory).map(([trackId, positions]) => {
//             if (positions.length < 2) return null;
//             return (
//               <g key={`trail-${trackId}`}>
//                 {positions.slice(0, -1).map((pos, i) => {
//                   const [x1, y1] = polarToXY(Math.hypot(pos.x_m, pos.y_m), (Math.atan2(pos.y_m, pos.x_m) * 180) / Math.PI, pxPerM);
//                   const nextPos = positions[i + 1];
//                   const [x2, y2] = polarToXY(Math.hypot(nextPos.x_m, nextPos.y_m), (Math.atan2(nextPos.y_m, nextPos.x_m) * 180) / Math.PI, pxPerM);
//                   return (
//                     <line key={`seg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.dynamicObj} strokeWidth={1.5} opacity={0.3 + i * 0.07} />
//                   );
//                 })}
//               </g>
//             );
//           })}

//           {/* Current tracks */}
//           {frame?.tracks?.map((t) => {
//             const [x, y] = polarToXY(Math.hypot(t.x_m, t.y_m), (Math.atan2(t.y_m, t.x_m) * 180) / Math.PI, pxPerM);
//             return (
//               <g key={`track-${t.id}`}>
//                 <circle cx={x} cy={y} r={8} fill={COLORS.dynamicObj} opacity={0.2} />
//                 <rect x={x - 9} y={y - 7} width={18} height={14} rx={3} fill="none" stroke={COLORS.dynamicObj} strokeWidth={1.5} />
//                 <text x={x} y={y - 11} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="9" fill={COLORS.dynamicObj} fontWeight="bold">
//                   #{t.id}
//                 </text>
//               </g>
//             );
//           })}

//           <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
//         </svg>
//       </div>

//       {/* Band legend and explanation */}
//       <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//         <p className="text-xs tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Resolution Bands (Near to Far)</p>
//         <div className="space-y-2">
//           {bandConfig?.bands.map((b, i) => (
//             <div key={b.name} className="flex items-start gap-3">
//               <div className="w-3 h-3 mt-1 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.bandRamp[i % COLORS.bandRamp.length] }} />
//               <div className="text-xs font-mono flex-1">
//                 <p style={{ color: COLORS.textPrimary }}>
//                   {b.inner_radius_m}–{b.outer_radius_m}m: <span style={{ color: COLORS.accent }}>{(b.cell_size_m * 100).toFixed(0)} cm</span> cells, {b.max_height_layers} layer{b.max_height_layers !== 1 ? 's' : ''}
//                 </p>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Why Adaptive */}
//       <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//         <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.accent }}>Why Adaptive Resolution?</p>
//         <div className="grid grid-cols-3 gap-2 text-xs">
//           <div>
//             <p style={{ color: COLORS.accent, fontWeight: 'bold' }}>NEAR FIELD</p>
//             <p style={{ color: COLORS.textMuted }}>Fine detail needed</p>
//           </div>
//           <div>
//             <p style={{ color: COLORS.textMuted, fontWeight: 'bold' }}>MID FIELD</p>
//             <p style={{ color: COLORS.textMuted }}>Balanced</p>
//           </div>
//           <div>
//             <p style={{ color: COLORS.textMuted, fontWeight: 'bold' }}>FAR FIELD</p>
//             <p style={{ color: COLORS.textMuted }}>Reduce redundancy</p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// function CompareView({ benchmark, loading, onRun, bandConfig }) {
//   return (
//     <div className="w-full flex flex-col gap-4">
//       <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
//         <div className="flex items-center justify-between mb-4">
//           <div>
//             <p className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>
//               Uniform vs. Adaptive — Measured, Not Estimated
//             </p>
//             <p className="text-xs mt-1" style={{ color: COLORS.textFaint }}>
//               Real grid build on realistic-density synthetic scene (51,200 points)
//             </p>
//           </div>
//           <button
//             onClick={onRun}
//             disabled={loading}
//             className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono uppercase"
//             style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panelAlt, color: COLORS.accent, opacity: loading ? 0.6 : 1 }}
//           >
//             <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
//             {loading ? 'Running Benchmark…' : 'Run Benchmark'}
//           </button>
//         </div>

//         {!benchmark ? (
//           <div className="p-4 rounded-md border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//             <p className="text-xs font-mono" style={{ color: COLORS.textMuted }}>
//               Click "Run Benchmark" to build both uniform and adaptive grids from the same input scene and compare measured cell counts, memory, and build latency. Takes ~1 second.
//             </p>
//           </div>
//         ) : (
//           <>
//             {/* Main metrics table */}
//             <div className="mb-4 overflow-x-auto">
//               <table className="w-full text-xs font-mono border-collapse">
//                 <thead>
//                   <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
//                     <th className="text-left py-2 px-2" style={{ color: COLORS.textFaint }}>Metric</th>
//                     <th className="text-right py-2 px-2" style={{ color: COLORS.textFaint }}>Uniform (finest resolution)</th>
//                     <th className="text-right py-2 px-2" style={{ color: COLORS.textFaint }}>Adaptive (range-graded)</th>
//                     <th className="text-right py-2 px-2" style={{ color: COLORS.accent }}>Advantage</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
//                     <td className="py-2 px-2" style={{ color: COLORS.textMuted }}>Cell count</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.uniform.cell_count.toLocaleString()}</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.adaptive.cell_count.toLocaleString()}</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
//                       {benchmark.compression_ratio}× fewer
//                     </td>
//                   </tr>
//                   <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
//                     <td className="py-2 px-2" style={{ color: COLORS.textMuted }}>Est. memory (MB)</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.uniform.estimated_memory_mb}</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.adaptive.estimated_memory_mb}</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
//                       {benchmark.memory_saved_mb} MB
//                     </td>
//                   </tr>
//                   <tr>
//                     <td className="py-2 px-2" style={{ color: COLORS.textMuted }}>Build latency (ms)</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.uniform.build_latency_ms}</td>
//                     <td className="text-right py-2 px-2" style={{ color: COLORS.textPrimary }}>{benchmark.adaptive.build_latency_ms}</td>
//                     <td className="text-right py-2 px-2" style={{ color: benchmark.adaptive.build_latency_ms < benchmark.uniform.build_latency_ms ? COLORS.accent : COLORS.textMuted }}>
//                       {benchmark.adaptive.build_latency_ms < benchmark.uniform.build_latency_ms ? '✓ Faster' : '—'}
//                     </td>
//                   </tr>
//                 </tbody>
//               </table>
//             </div>

//             {/* Band breakdown for adaptive */}
//             <div className="mb-4">
//               <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Adaptive Grid Breakdown (by Band)</p>
//               <div className="grid grid-cols-2 gap-2">
//                 {Object.entries(benchmark.adaptive.cells_by_band).map(([bandName, count]) => {
//                   const band = bandConfig?.bands.find((b) => b.name === bandName);
//                   return (
//                     <div key={bandName} className="p-2 rounded-md border text-xs font-mono" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
//                       <p style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{bandName}</p>
//                       <p style={{ color: COLORS.textMuted }}>
//                         {count} cells {band && `@ ${(band.cell_size_m * 100).toFixed(0)}cm`}
//                       </p>
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>

//             {/* Summary callout */}
//             <div className="p-3 rounded-md border" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panelAlt }}>
//               <p className="text-xs font-mono" style={{ color: COLORS.textFaint }}>
//                 <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Input: </span>
//                 {benchmark.input_point_count.toLocaleString()} points
//                 {' · '}
//                 <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Overhang cells (adaptive): </span>
//                 {benchmark.adaptive.overhang_cells}
//               </p>
//               <p className="text-xs font-mono mt-2" style={{ color: COLORS.textFaint }}>
//                 This benchmark run is from a <strong>single realistic sensor sweep</strong>. Compression ratios on real scenes are more modest than geometric estimates because not every cell gets populated.
//               </p>
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Play, Pause, AlertTriangle, Activity, Wifi, WifiOff, X, RefreshCw, ChevronRight } from 'lucide-react';
import DatasetIngestion from './DatasetIngestion';

// ---------------------------------------------------------------------------
// FoveaLidar dashboard - PROJECT_REQUIREMENTS.md S13, ARCHITECTURE.md S19/20.
//
// Five views (Raw / Semantic / 2.5D / Adaptive Grid / Compare), a cell
// inspector, and a live WebSocket connection to the real backend at
// src/api/main.py - this renders real pipeline output, not a client-side
// simulation. Run `uvicorn src.api.main:app` first, then this against it
// (BACKEND_HTTP / BACKEND_WS below).
// ---------------------------------------------------------------------------

const BACKEND_HTTP = 'http://localhost:8000';
const BACKEND_WS = 'ws://localhost:8000/ws/frames';

const CENTER = 300;
const VIEW_PX = 600;
// px-per-metre is derived from whatever /api/config reports as max_range_m,
// not hard-coded, so this never drifts from the backend's actual bands.

const COLORS = {
  bg: '#0B1016', panel: '#111820', panelAlt: '#0F151C', border: '#26333F',
  textPrimary: '#E7EDF2', textMuted: '#8593A1', textFaint: '#5B6672',
  bandRamp: ['#FF8552', '#E3B23C', '#59C1B0', '#3EA0D6'], // warm (fine/near) -> cool (coarse/far), one per band index
  terrain: '#64707C', staticObs: '#9B8CFF', dynamicObj: '#4EA1FF',
  drivable: '#4A7C59', nonDrivable: '#8a8f6b',
  alert: '#FF5C6C', accent: '#59C1B0',
};

const VIEWS = ['Raw', 'Semantic', '2.5D', 'Adaptive Grid', 'Compare'];

function polarToXY(r, angleDeg, pxPerM) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + r * pxPerM * Math.cos(rad), CENTER + r * pxPerM * Math.sin(rad)];
}

function classColor(cls) {
  switch (cls) {
    case 'drivable': return COLORS.drivable;
    case 'non_drivable': return COLORS.nonDrivable;
    case 'static_obstacle': return COLORS.staticObs;
    case 'dynamic_object': return COLORS.dynamicObj;
    default: return COLORS.textFaint;
  }
}

const FRAME_BUFFER_SIZE = 40;

// Resolves each cell's (band, angle_bin, range_bin) address into an actual
// (x, y) screen position. Previously defined identically in three places
// (the dashboard root, View2D, AdaptiveGridView) - one shared version so
// the three views can never quietly drift apart.
function resolveCells(frame, bandConfig, pxPerM) {
  if (!frame || !bandConfig) return [];
  const angleStep = 360 / bandConfig.angle_bins;
  return frame.cells.map((c) => {
    const band = bandConfig.bands.find((b) => b.name === c.band);
    if (!band) return null;
    const r = band.inner_radius_m + (c.range_bin + 0.5) * band.cell_size_m;
    const angle = (c.angle_bin + 0.5) * angleStep;
    const [x, y] = polarToXY(r, angle, pxPerM);
    return { ...c, r_m: r, angle_deg: angle, x, y, cellSizePx: Math.max(1.5, band.cell_size_m * pxPerM) };
  }).filter(Boolean);
}

// Mirrors src/config.py's RESOLUTION_BANDS exactly. Used only when
// GET /api/config fails, so a page load with no backend reachable still
// renders true-to-spec band geometry instead of a blank screen.
const DEFAULT_BAND_CONFIG = {
  bands: [
    { name: 'band_0_10m', inner_radius_m: 0, outer_radius_m: 10, cell_size_m: 0.05, max_height_layers: 6 },
    { name: 'band_10_30m', inner_radius_m: 10, outer_radius_m: 30, cell_size_m: 0.10, max_height_layers: 4 },
    { name: 'band_30_60m', inner_radius_m: 30, outer_radius_m: 60, cell_size_m: 0.25, max_height_layers: 2 },
    { name: 'band_60_100m', inner_radius_m: 60, outer_radius_m: 100, cell_size_m: 0.50, max_height_layers: 1 },
  ],
  angle_bins: 360,
  max_range_m: 100,
};

const DEMO_CLASSES = ['drivable', 'drivable', 'non_drivable', 'static_obstacle', 'dynamic_object'];

// Deterministic sample frame, shaped exactly like a real /ws/frames
// message (same keys the backend's GridCell.snapshot() sends). Only used
// as a fallback when the real backend can't be reached, and always
// labelled as sample data everywhere it's shown - never presented as if
// it were live pipeline output.
function buildDemoFrame(bandConfig, tick) {
  const cells = [];
  const cellsByBand = {};
  let overhang = 0;
  bandConfig.bands.forEach((band, bandIdx) => {
    const angleStep = 6 + bandIdx * 4; // sparser sampling for coarser/far bands
    for (let angleBin = 0; angleBin < 360; angleBin += angleStep) {
      const wobble = Math.sin((angleBin + tick * 7) / 23) * 0.5 + 0.5;
      if (wobble < 0.32) continue; // leaves gaps instead of a solid disc
      const rangeBin = Math.floor(((angleBin * 13 + tick * 3) % 97) / 10);
      const seed = (angleBin * 31 + bandIdx * 977 + tick * 13) % DEMO_CLASSES.length;
      const cls = DEMO_CLASSES[seed];
      const twoLayer = (angleBin + bandIdx) % 17 === 0;
      const layers = [{ height_m: 0.1 + wobble * 0.4, class: cls, confidence: 0.7 + wobble * 0.25, points: 1 + (seed % 4) }];
      if (twoLayer) {
        layers.push({ height_m: 1.6 + wobble * 0.6, class: 'static_obstacle', confidence: 0.6, points: 2 });
        overhang += 1;
      }
      cells.push({ band: band.name, angle_bin: angleBin, range_bin: rangeBin, dominant_class: cls, layers });
      cellsByBand[band.name] = (cellsByBand[band.name] || 0) + 1;
    }
  });
  const trackAngle = (tick * 5) % 360;
  const trackRad = ((trackAngle - 90) * Math.PI) / 180;
  const tracks = [{
    id: 1,
    x_m: Math.round(18 * Math.cos(trackRad) * 100) / 100,
    y_m: Math.round(18 * Math.sin(trackRad) * 100) / 100,
    class: 'dynamic_object',
    age: (tick % 40) + 1,
  }];
  return {
    schema_version: 1,
    frame_id: tick,
    cell_count: cells.length,
    cells_by_band: cellsByBand,
    overhang_cells: overhang,
    cells,
    tracks,
    is_demo: true,
  };
}

function Toggle({ label, checked, onChange, accent }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between px-3 py-2 rounded-md border transition-colors"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}
    >
      <span className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.textMuted }}>{label}</span>
      <span className="w-9 h-5 rounded-full relative flex-shrink-0" style={{ backgroundColor: checked ? accent : '#2A3641' }}>
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
          style={{ backgroundColor: COLORS.bg, transform: checked ? 'translateX(16px)' : 'translateX(0px)' }}
        />
      </span>
    </button>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.textMuted }}>{label}</span>
      <span className="text-right font-mono">
        <span className="text-sm" style={{ color: COLORS.textPrimary }}>{value}</span>
        {sub ? <span className="text-xs ml-1" style={{ color: COLORS.textFaint }}>{sub}</span> : null}
      </span>
    </div>
  );
}

export default function FoveaLidarDashboard() {
  const [view, setView] = useState('Adaptive Grid');
  const [connected, setConnected] = useState(false); // true only for a real backend WS
  const [demoMode, setDemoMode] = useState(false); // true while synthesizing sample frames locally
  const [frameBuffer, setFrameBuffer] = useState([]); // rolling window of recent frames, for scrubbing
  const [bufferIndex, setBufferIndex] = useState(0);
  const [followLive, setFollowLive] = useState(true); // false once the user has scrubbed back
  const [bandConfig, setBandConfig] = useState(null); // /api/config response, or DEFAULT_BAND_CONFIG
  const [selectedCell, setSelectedCell] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [trackHistory, setTrackHistory] = useState({}); // track ID -> array of {x_m, y_m, frame_id}
  const [activeInspection, setActiveInspection] = useState(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [uploadedDatasetName, setUploadedDatasetName] = useState(null); // non-null when a file was uploaded
  const wsRef = useRef(null);
  const demoTimerRef = useRef(null);
  const bandConfigRef = useRef(null); // lets the demo timer read the latest config without restarting the WS effect

  useEffect(() => {
    fetch(`${BACKEND_HTTP}/api/dataset/active`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.inspection) {
          setActiveInspection(data.inspection);
        }
      })
      .catch(() => {});
  }, []);

  // /api/config once on mount - single source of truth for band geometry,
  // never a hard-coded copy of src/config.py's values (RULES.md - Configuration).
  // Falls back to DEFAULT_BAND_CONFIG (mirrors src/config.py) instead of
  // null, so the page still renders real-shaped bands with no backend up.
  useEffect(() => {
    fetch(`${BACKEND_HTTP}/api/config`)
      .then((r) => r.json())
      .then(setBandConfig)
      .catch(() => setBandConfig(DEFAULT_BAND_CONFIG));
  }, []);

  useEffect(() => { bandConfigRef.current = bandConfig; }, [bandConfig]);

  const applyFrame = useCallback((data) => {
    setFrameBuffer((prev) => (prev.length >= FRAME_BUFFER_SIZE ? [...prev.slice(1), data] : [...prev, data]));
    if (data.tracks) {
      setTrackHistory((prev) => {
        const updated = { ...prev };
        data.tracks.forEach((t) => {
          if (!updated[t.id]) updated[t.id] = [];
          updated[t.id].push({ x_m: t.x_m, y_m: t.y_m, frame_id: data.frame_id });
          // Keep only last 10 positions for motion trail
          if (updated[t.id].length > 10) updated[t.id].shift();
        });
        return updated;
      });
    }
  }, []);

  // WebSocket connection, one, feeding every view (ARCHITECTURE.md S19/20
  // diagram). If the backend never answers, or drops, this falls back to a
  // locally-synthesized demo stream after a short grace period and keeps
  // retrying the real connection in the background - so opening the
  // deployed frontend with no backend running shows a clearly-labelled
  // sample instead of an empty screen, and swaps to real data automatically
  // the moment the backend becomes reachable.
  useEffect(() => {
    if (!playing) {
      wsRef.current?.close();
      if (demoTimerRef.current) { clearInterval(demoTimerRef.current); demoTimerRef.current = null; }
      setDemoMode(false);
      return undefined;
    }

    let cancelled = false;
    let fallbackTimer = null;
    let retryTimer = null;
    let tick = 0;

    const startDemo = () => {
      if (demoTimerRef.current || cancelled) return;
      setDemoMode(true);
      demoTimerRef.current = setInterval(() => {
        tick += 1;
        applyFrame(buildDemoFrame(bandConfigRef.current || DEFAULT_BAND_CONFIG, tick));
      }, 300);
    };

    const stopDemo = () => {
      if (demoTimerRef.current) { clearInterval(demoTimerRef.current); demoTimerRef.current = null; }
      setDemoMode(false);
    };

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;
      fallbackTimer = setTimeout(startDemo, 2500);
      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        stopDemo();
        setConnected(true);
      };
      ws.onmessage = (evt) => applyFrame(JSON.parse(evt.data));
      const handleDown = () => {
        setConnected(false);
        if (cancelled) return;
        startDemo();
        retryTimer = setTimeout(connect, 5000);
      };
      ws.onclose = handleDown;
      ws.onerror = handleDown;
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      clearTimeout(retryTimer);
      stopDemo();
      wsRef.current?.close();
    };
  }, [playing, applyFrame]);

  // Which buffered frame is on screen right now - the tip while following
  // live, or whatever the user scrubbed to otherwise.
  const currentIndex = followLive ? frameBuffer.length - 1 : Math.min(bufferIndex, frameBuffer.length - 1);
  const frame = frameBuffer[currentIndex] ?? null;

  const goFirst = useCallback(() => { setFollowLive(false); setBufferIndex(0); }, []);
  const goPrev = useCallback(() => {
    setFollowLive(false);
    setBufferIndex((i) => Math.max(0, (followLive ? frameBuffer.length - 1 : i) - 1));
  }, [followLive, frameBuffer.length]);
  const goNext = useCallback(() => {
    setBufferIndex((i) => {
      const base = followLive ? frameBuffer.length - 1 : i;
      const next = Math.min(frameBuffer.length - 1, base + 1);
      if (next >= frameBuffer.length - 1) setFollowLive(true);
      return next;
    });
  }, [followLive, frameBuffer.length]);
  const goLive = useCallback(() => setFollowLive(true), []);

  const pxPerM = bandConfig ? (VIEW_PX / 2 - 20) / bandConfig.max_range_m : 2.8;

  const runBenchmark = useCallback(() => {
    setBenchmarkLoading(true);
    fetch(`${BACKEND_HTTP}/api/benchmark/run`)
      .then((r) => r.json())
      .then(setBenchmark)
      .finally(() => setBenchmarkLoading(false));
  }, []);

  const handleDatasetLoaded = useCallback((data) => {
    // API returns { status, inspection, preview_points } - extract the inspection object
    const inspection = data?.inspection ?? data;
    setActiveInspection(inspection);
    setUploadedDatasetName(inspection?.filename ?? null);

    // Immediately process the uploaded file through the adaptive grid pipeline
    // so Adaptive Grid, 2.5D, and Semantic views all show the uploaded data.
    fetch(`${BACKEND_HTTP}/api/dataset/grid-frame`)
      .then((r) => r.ok ? r.json() : null)
      .then((gridFrame) => {
        if (gridFrame) {
          // Clear buffer and inject the uploaded frame so all views show it
          setFrameBuffer([gridFrame]);
          setBufferIndex(0);
          setFollowLive(true);
          setTrackHistory({});
        }
      })
      .catch(() => {}); // fail silently — views fall back to live stream
  }, []);

  // "Run Pipeline on Dataset" button — inspection is already loaded; just run
  // the benchmark (which uses the active dataset on the backend) and show Compare.
  const handleRunPipeline = useCallback(() => {
    setView('Compare');
    runBenchmark();
  }, [runBenchmark]);

  const handleCompareBenchmark = useCallback(() => {
    setView('Compare');
    runBenchmark();
  }, [runBenchmark]);

  const bandIndexByName = useMemo(() => {
    if (!bandConfig) return {};
    const m = {};
    bandConfig.bands.forEach((b, i) => { m[b.name] = i; });
    return m;
  }, [bandConfig]);

  // Compute semantic class distribution from cells
  const semanticDistribution = useMemo(() => {
    if (!frame || !frame.cells) return {};
    const dist = { drivable: 0, non_drivable: 0, static_obstacle: 0, dynamic_object: 0, unknown: 0 };
    frame.cells.forEach((c) => {
      if (c.dominant_class in dist) dist[c.dominant_class]++;
    });
    return dist;
  }, [frame]);

  const rangeRingsPx = useMemo(() => {
    if (!bandConfig) return [];
    return bandConfig.bands.map((b, i) => ({ r: b.outer_radius_m * pxPerM, color: COLORS.bandRamp[i % COLORS.bandRamp.length] }));
  }, [bandConfig, pxPerM]);

  // One plain-language line tying this frame's raw counts back to *why*
  // adaptive resolution exists, shown in the sidebar on every tab. This
  // explanation previously only existed as static text on the Adaptive
  // Grid tab, disconnected from the numbers actually being shown.
  const whyItMattersLine = useMemo(() => {
    if (!frame || !bandConfig?.bands?.length) return null;
    const finest = bandConfig.bands[0];
    const coarsest = bandConfig.bands[bandConfig.bands.length - 1];
    return `Near-field (0–${finest.outer_radius_m}m) gets ${(finest.cell_size_m * 100).toFixed(0)}cm cells; far-field (${coarsest.inner_radius_m}–${coarsest.outer_radius_m}m) gets ${(coarsest.cell_size_m * 100).toFixed(0)}cm. ${frame.overhang_cells} cell${frame.overhang_cells === 1 ? '' : 's'} this frame needed more than one height layer.`;
  }, [frame, bandConfig]);

  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: COLORS.bg, color: COLORS.textPrimary }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-wrap gap-2" style={{ borderColor: COLORS.border }}>
        <div>
          <h1 className="text-sm font-bold tracking-widest uppercase">FoveaLidar</h1>
          <p className="text-xs font-mono mt-0.5" style={{ color: COLORS.textMuted }}>SIH 26053 · DRDO / Smart Vehicles</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-mono uppercase" style={{ color: connected ? COLORS.accent : demoMode ? COLORS.bandRamp[1] : COLORS.alert }}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'Live' : demoMode ? 'Demo data' : 'Connecting…'}
          </span>
          <button type="button" onClick={() => setPlaying((p) => !p)} className="p-2 rounded-md border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      {/* Uploaded dataset active banner */}
      {uploadedDatasetName && (
        <div className="mx-4 mt-3 p-3 rounded-md border text-xs font-mono flex items-center gap-3" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.accent + '15', color: COLORS.textPrimary }}>
          <span style={{ color: COLORS.accent, fontWeight: 'bold', whiteSpace: 'nowrap' }}>📂 Dataset loaded:</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{uploadedDatasetName}</span>
          <span style={{ color: COLORS.textMuted }}>— All views now show the adaptive grid built from your file. Switch to Adaptive Grid or 2.5D tab to see it.</span>
          <button
            onClick={() => { setUploadedDatasetName(null); }}
            className="ml-auto text-[10px] px-2 py-0.5 rounded border"
            style={{ borderColor: COLORS.border, color: COLORS.textFaint, cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap' }}
          >
            ✕ dismiss
          </button>
        </div>
      )}

      {!connected && demoMode && (
        <div className="mx-4 mt-3 p-3 rounded-md border text-xs font-mono" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panelAlt, color: COLORS.textMuted }}>
          <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Sample data</span> — backend not reachable at {BACKEND_WS}, so every view below is a locally-generated demo stream, not real pipeline output. It'll swap to the real feed automatically once the backend is up:{' '}
          <span style={{ color: COLORS.textPrimary }}>PYTHONPATH=. uvicorn src.api.main:app --reload</span>
        </div>
      )}
      {!connected && !demoMode && (
        <div className="mx-4 mt-3 p-3 rounded-md border text-xs font-mono" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt, color: COLORS.textMuted }}>
          Connecting to {BACKEND_WS}…
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 px-4 pt-3 flex-wrap">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-3 py-1.5 rounded-t-md text-xs font-mono uppercase tracking-wide border-b-2 transition-colors"
            style={{
              borderColor: view === v ? COLORS.accent : 'transparent',
              color: view === v ? COLORS.textPrimary : COLORS.textMuted,
              backgroundColor: view === v ? COLORS.panel : 'transparent',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4">
        {/* Main viewport */}
        <div className="flex-1 flex flex-col items-center">
          {view === 'Compare' ? (
            <CompareView benchmark={benchmark} loading={benchmarkLoading} onRun={runBenchmark} bandConfig={bandConfig} />
          ) : view === 'Raw' ? (
            <div className="w-full flex flex-col items-center gap-4">
              <DatasetIngestion
                onDatasetLoaded={handleDatasetLoaded}
                onRunPipeline={handleRunPipeline}
                onCompareBenchmark={handleCompareBenchmark}
                activeInspection={activeInspection}
                loading={datasetLoading}
                setLoading={setDatasetLoading}
              />
              <RawLidarView
                frame={frame}
                bandConfig={bandConfig}
                pxPerM={pxPerM}
                setSelectedCell={setSelectedCell}
                demoMode={demoMode}
                followLive={followLive}
                bufferLength={frameBuffer.length}
                currentIndex={currentIndex}
                onFirst={goFirst}
                onPrev={goPrev}
                onNext={goNext}
                onLive={goLive}
              />
            </div>
          ) : view === 'Semantic' ? (
            <SemanticView frame={frame} bandConfig={bandConfig} pxPerM={pxPerM} semanticDistribution={semanticDistribution} setSelectedCell={setSelectedCell} />
          ) : view === '2.5D' ? (
            <View2D frame={frame} bandConfig={bandConfig} pxPerM={pxPerM} setSelectedCell={setSelectedCell} bandIndexByName={bandIndexByName} />
          ) : (
            <AdaptiveGridView
              frame={frame}
              bandConfig={bandConfig}
              pxPerM={pxPerM}
              rangeRingsPx={rangeRingsPx}
              setSelectedCell={setSelectedCell}
              bandIndexByName={bandIndexByName}
              trackHistory={trackHistory}
            />
          )}

          {view !== 'Compare' && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center mt-4 text-xs font-mono">
              {view === 'Adaptive Grid' && bandConfig?.bands.map((b, i) => (
                <span key={b.name} className="flex items-center gap-2" style={{ color: COLORS.textMuted }}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.bandRamp[i % COLORS.bandRamp.length] }} />
                  {b.name} ({(b.cell_size_m * 100).toFixed(0)}cm)
                </span>
              ))}
              {(view === 'Raw' || view === 'Semantic') && (
                <span style={{ color: COLORS.textMuted }}>Each square = one sensor cell</span>
              )}
              {view === '2.5D' && (
                <span style={{ color: COLORS.alert }}>█ Red border = multi-layer cells (overhangs)</span>
              )}
              {(view === 'Semantic') && (
                <>
                  {[['Drivable', COLORS.drivable], ['Non-drivable', COLORS.nonDrivable], ['Static', COLORS.staticObs]].map(([label, color]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </span>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 flex flex-col gap-4">
          <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
            <p className="text-xs tracking-widest font-mono uppercase mb-1" style={{ color: COLORS.textFaint }}>Telemetry {demoMode ? '(demo)' : '(live)'}</p>
            <Stat label="Cells" value={frame ? frame.cell_count.toLocaleString() : '—'} />
            <Stat label="Overhang cells" value={frame ? frame.overhang_cells : '—'} sub=">1 height layer" />
            <Stat label="Tracks" value={frame ? frame.tracks.length : '—'} />
            {frame && Object.entries(frame.cells_by_band).map(([band, count]) => (
              <div key={band} className="flex items-baseline justify-between py-0.5 pl-2">
                <span className="text-xs font-mono" style={{ color: COLORS.textFaint }}>{band}</span>
                <span className="text-xs font-mono" style={{ color: COLORS.textMuted }}>{count}</span>
              </div>
            ))}
            {whyItMattersLine && (
              <p className="text-xs mt-2 pt-2 border-t" style={{ color: COLORS.textMuted, borderColor: COLORS.border }}>{whyItMattersLine}</p>
            )}
          </div>

          {selectedCell && (
            <div className="rounded-lg border p-3" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panelAlt }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.accent }}>Cell inspector</p>
                <button onClick={() => setSelectedCell(null)}><X size={14} color={COLORS.textMuted} /></button>
              </div>
              <Stat label="Band" value={selectedCell.band} />
              <Stat label="Distance" value={selectedCell.r_m.toFixed(2)} sub="m" />
              <Stat label="Resolution" value={(bandConfig?.bands.find((b) => b.name === selectedCell.band)?.cell_size_m ?? 0).toFixed(2)} sub="m/cell" />
              <Stat label="Dominant class" value={selectedCell.dominant_class} />
              <Stat label="Layers" value={selectedCell.layers.length} />
              {selectedCell.layers.map((l, i) => (
                <div key={i} className="mt-1 pl-2 border-l" style={{ borderColor: COLORS.border }}>
                  <Stat label={`Layer ${i} elevation`} value={l.height_m.toFixed(2)} sub="m" />
                  <Stat label={`Layer ${i} class`} value={l.class} />
                  <Stat label={`Layer ${i} confidence`} value={l.confidence.toFixed(2)} />
                  <Stat label={`Layer ${i} points`} value={l.points} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RawLidarView({ frame, bandConfig, pxPerM, setSelectedCell, demoMode, followLive, bufferLength, currentIndex, onFirst, onPrev, onNext, onLive }) {
  const resolvedCells = useMemo(() => resolveCells(frame, bandConfig, pxPerM), [frame, bandConfig, pxPerM]);
  const canGoPrev = currentIndex > 0;
  const canGoNext = !followLive && currentIndex < bufferLength - 1;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Dataset Source Panel - only the streaming source is actually wired
          up right now; the rest are shown as an honest roadmap rather than
          buttons that look live but silently do nothing. */}
      <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Dataset Source</p>
            <div className="flex gap-2 flex-wrap">
              <span
                className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase"
                style={{ borderColor: COLORS.accent, backgroundColor: 'rgba(89, 193, 176, 0.1)', color: COLORS.accent }}
              >
                {demoMode ? 'Sample Demo Stream' : 'Live Synthetic'}
              </span>
              {['SemanticKITTI', 'nuScenes', 'Upload CSV / LAS'].map((label) => (
                <span
                  key={label}
                  title="Not wired into this UI yet - the adapter exists in the pipeline, but this dashboard only renders the live streaming source right now."
                  className="px-3 py-1.5 rounded-md border text-xs font-mono uppercase opacity-50 cursor-not-allowed"
                  style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: COLORS.textMuted }}
                >
                  {label} · Coming soon
                </span>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: COLORS.textFaint }}>Hover a disabled option for why - keeps the roadmap visible without pretending those sources already work.</p>
          </div>

          {/* Frame History - scrubs the last few buffered frames without stopping the stream */}
          <div>
            <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Frame History</p>
            <div className="flex gap-2 items-center">
              <button
                onClick={onFirst}
                disabled={!canGoPrev}
                className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: canGoPrev ? COLORS.textMuted : COLORS.textFaint, cursor: canGoPrev ? 'pointer' : 'not-allowed', opacity: canGoPrev ? 1 : 0.5 }}
              >
                ⏮ First
              </button>
              <button
                onClick={onPrev}
                disabled={!canGoPrev}
                className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: canGoPrev ? COLORS.textMuted : COLORS.textFaint, cursor: canGoPrev ? 'pointer' : 'not-allowed', opacity: canGoPrev ? 1 : 0.5 }}
              >
                ◀ Prev
              </button>
              <div className="flex-1 px-2 py-1.5 rounded-md border text-xs font-mono text-center" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: COLORS.textPrimary }}>
                Frame {frame?.frame_id ?? '—'} · {bufferLength ? currentIndex + 1 : 0}/{bufferLength} buffered {followLive ? '(live)' : '(paused)'}
              </div>
              <button
                onClick={onNext}
                disabled={!canGoNext}
                className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.bg, color: canGoNext ? COLORS.textMuted : COLORS.textFaint, cursor: canGoNext ? 'pointer' : 'not-allowed', opacity: canGoNext ? 1 : 0.5 }}
              >
                Next ▶
              </button>
              <button
                onClick={onLive}
                disabled={followLive}
                className="px-2 py-1.5 rounded-md border text-xs font-mono uppercase transition-colors"
                style={{ borderColor: followLive ? COLORS.border : COLORS.accent, backgroundColor: COLORS.bg, color: followLive ? COLORS.textFaint : COLORS.accent, cursor: followLive ? 'not-allowed' : 'pointer', opacity: followLive ? 0.5 : 1 }}
              >
                Live ⏭
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: COLORS.textFaint }}>💡 Prev/Next step back through buffered frames without stopping the stream. "Live" jumps back to the current frame; "Pause" in the header freezes it entirely.</p>
          </div>
        </div>
      </div>

      {/* Main visualization */}
      <div className="rounded-lg border p-4" style={{ borderColor: COLORS.accent, backgroundColor: COLORS.panel }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs tracking-widest font-mono uppercase" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
              Raw LiDAR Point Cloud
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textFaint }}>
              Unprocessed sensor input, before classification or mapping
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono" style={{ color: COLORS.textMuted }}>Frame #{frame?.frame_id ?? '—'}</p>
            <p className="text-xs font-mono mt-1" style={{ color: COLORS.textMuted }}>Rate: {demoMode ? '~3 Hz (demo)' : '~10 Hz'}</p>
          </div>
        </div>

        {/* SVG Visualization */}
        <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Raw LiDAR point cloud" style={{ border: `1px solid ${COLORS.border}`, borderRadius: '4px', backgroundColor: '#000000' }}>
          {/* Range rings for reference */}
          {bandConfig?.bands.map((b, i) => (
            <circle key={`ring-${i}`} cx={CENTER} cy={CENTER} r={b.outer_radius_m * pxPerM} fill="none" stroke={COLORS.textFaint} strokeWidth={0.5} opacity={0.2} strokeDasharray="2,2" />
          ))}

          {/* Raw point cloud - each cell represents raw input point(s); click to inspect */}
          {resolvedCells.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={c.cellSizePx / 2}
              fill={COLORS.textMuted}
              opacity={0.6}
              onClick={() => setSelectedCell(c)}
              style={{ cursor: 'pointer' }}
            />
          ))}

          {/* Sensor origin - highlighted */}
          <circle cx={CENTER} cy={CENTER} r={5} fill={COLORS.accent} opacity={0.8} />
          <circle cx={CENTER} cy={CENTER} r={8} fill="none" stroke={COLORS.accent} strokeWidth={1} opacity={0.4} />
          <text x={CENTER} y={CENTER - 15} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fill={COLORS.accent} fontWeight="bold">
            SENSOR ORIGIN
          </text>
        </svg>
      </div>

      {/* Detailed metrics cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Cells This Frame</p>
          <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>{frame ? frame.cell_count.toLocaleString() : '—'}</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>occupied grid cells</p>
        </div>

        <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Sensing Range</p>
          <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>{bandConfig?.max_range_m ?? '—'}m</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>max distance</p>
        </div>

        <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Angular Resolution</p>
          <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>{bandConfig?.angle_bins ?? '—'}</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>angle bins (0.1°)</p>
        </div>

        <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono uppercase" style={{ color: COLORS.textFaint }}>Visualization</p>
          <p className="text-lg font-mono font-bold mt-2" style={{ color: COLORS.accent }}>2D</p>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>top-down view</p>
        </div>
      </div>

      {/* Frame info and source data description */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Data Source</p>
        <div className="space-y-1 text-xs" style={{ color: COLORS.textMuted }}>
          <p>• <strong>Source:</strong> {demoMode ? 'Locally-generated sample stream (backend unreachable)' : 'SyntheticAdapter (realistic LiDAR simulator)'}</p>
          <p>• <strong>Update Rate:</strong> {demoMode ? '~3 Hz sample tick' : '~10 Hz (100ms per frame)'}</p>
          <p>• <strong>Format:</strong> Polar coordinates (angle, range, height) + intensity</p>
          <p>• <strong>Note:</strong> This is the raw, unprocessed sensor input before any preprocessing, classification, or mapping stages</p>
        </div>
      </div>

      {/* Visual legend explaining the display */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Visualization Guide</p>
        <div className="space-y-1 text-xs" style={{ color: COLORS.textMuted }}>
          <p>
            <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: COLORS.accent }} />
            <span className="ml-2">Sensor origin (0, 0)</span>
          </p>
          <p>
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.textMuted }} />
            <span className="ml-2">Input points (click any point to inspect its cell)</span>
          </p>
          <p>
            <span className="inline-block">— — —</span>
            <span className="ml-2">Range rings (10m, 30m, 60m, 100m bands)</span>
          </p>
          <p className="mt-2" style={{ color: COLORS.accent, fontWeight: 'bold' }}>
            All data shown is raw, unprocessed sensor input for this frame.
          </p>
        </div>
      </div>
    </div>
  );
}

function SemanticView({ frame, bandConfig, pxPerM, semanticDistribution, setSelectedCell }) {
  const totalCells = Object.values(semanticDistribution).reduce((a, b) => a + b, 0);
  const resolvedCells = useMemo(() => resolveCells(frame, bandConfig, pxPerM), [frame, bandConfig, pxPerM]);
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="rounded-lg border p-2" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
        <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Semantic classification">
          {/* Range rings */}
          {bandConfig?.bands.map((b, i) => (
            <circle key={`ring-${i}`} cx={CENTER} cy={CENTER} r={b.outer_radius_m * pxPerM} fill="none" stroke={COLORS.textFaint} strokeWidth={0.5} opacity={0.3} />
          ))}

          {/* Semantic cells - click any cell to inspect its height layers */}
          {resolvedCells.map((c, i) => (
            <rect
              key={i}
              x={c.x - c.cellSizePx / 2}
              y={c.y - c.cellSizePx / 2}
              width={c.cellSizePx}
              height={c.cellSizePx}
              fill={classColor(c.dominant_class)}
              opacity={0.6}
              onClick={() => setSelectedCell(c)}
              style={{ cursor: 'pointer' }}
            />
          ))}

          <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
        </svg>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
        <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Class Distribution (Current Demo: Ground Truth Labels)</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(semanticDistribution).map(([cls, count]) => (
            <div key={cls} className="p-2 rounded-md" style={{ backgroundColor: COLORS.panelAlt }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: classColor(cls) }} />
                <span className="text-xs font-mono" style={{ color: COLORS.textMuted }}>{cls}</span>
              </div>
              <p className="text-sm font-bold" style={{ color: COLORS.textPrimary }}>
                {count}
              </p>
              <p className="text-xs" style={{ color: COLORS.textFaint }}>
                {totalCells > 0 ? ((count / totalCells) * 100).toFixed(1) : 0}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function View2D({ frame, bandConfig, pxPerM, setSelectedCell, bandIndexByName }) {
  const resolvedCells = useMemo(() => resolveCells(frame, bandConfig, pxPerM), [frame, bandConfig, pxPerM]);
  const canvasRef = useRef(null);
  const [tilt, setTilt] = React.useState(35);   // degrees from top-down, 0=flat 90=side
  const [azimuth, setAzimuth] = React.useState(30); // rotation around vertical axis

  // Draw 3D perspective projection on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    if (!resolvedCells || resolvedCells.length === 0) {
      ctx.fillStyle = COLORS.textFaint;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for frame data…', W / 2, H / 2);
      return;
    }

    const tiltRad = (tilt * Math.PI) / 180;
    const azRad = (azimuth * Math.PI) / 180;
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);
    const cosA = Math.cos(azRad);
    const sinA = Math.sin(azRad);
    const scale = W / (VIEW_PX * 1.8);

    // project 3D point (x,y,z) to canvas coords
    // x,y in sensor plane, z = height from layers
    const project = (wx, wy, wz) => {
      // center
      const cx = wx - CENTER;
      const cy = wy - CENTER;
      // rotate around vertical axis
      const rx = cx * cosA - cy * sinA;
      const ry = cx * sinA + cy * cosA;
      // tilt (y becomes depth, z rises)
      const sx = rx;
      const sy = ry * cosT - wz * sinT;
      return [
        W / 2 + sx * scale,
        H / 2 + sy * scale,
      ];
    };

    // draw range rings for context
    for (let i = 0; i < 4; i++) {
      const r = [10, 30, 60, 100][i] * pxPerM;
      const ringColor = COLORS.bandRamp[i] + '33';
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.05) {
        const wx = CENTER + r * Math.cos(a);
        const wy = CENTER + r * Math.sin(a);
        const [sx, sy] = project(wx, wy, 0);
        a === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Sort cells by depth for painter's algorithm
    const sorted = [...resolvedCells].sort((a, b) => {
      const [, ya] = project(a.x, a.y, 0);
      const [, yb] = project(b.x, b.y, 0);
      return yb - ya;
    });

    sorted.forEach((c) => {
      // Use height layers for z
      const layers = c.layers ?? [{ height_m: 0 }];
      layers.forEach((layer, li) => {
        const z = (layer.height_m ?? 0) * pxPerM * 2.5;
        const [sx, sy] = project(c.x, c.y, z);
        const sz = Math.max(2, c.cellSizePx * scale * 0.9);

        // color by class
        const cls = layer.class ?? c.dominant_class;
        let color;
        switch (cls) {
          case 'drivable': color = COLORS.drivable; break;
          case 'non_drivable': color = COLORS.nonDrivable; break;
          case 'static_obstacle': color = COLORS.staticObs; break;
          case 'dynamic_object': color = COLORS.dynamicObj; break;
          default: color = COLORS.textFaint;
        }

        // draw vertical pillar line from ground to layer
        if (li > 0) {
          const [gx, gy] = project(c.x, c.y, 0);
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = color + '55';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        ctx.fillStyle = color + (layers.length > 1 ? 'cc' : '99');
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);

        if (layers.length > 1) {
          ctx.strokeStyle = COLORS.alert + 'cc';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(sx - sz / 2, sy - sz / 2, sz, sz);
        }
      });
    });

    // sensor origin
    const [ox, oy] = project(CENTER, CENTER, 0);
    ctx.beginPath();
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();

  }, [resolvedCells, tilt, azimuth, pxPerM]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Label bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-t-lg px-3 py-2 text-center border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: COLORS.accent }}>3D Perspective</p>
          <p className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>Height-layered point cloud</p>
        </div>
        <div className="rounded-t-lg px-3 py-2 text-center border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
          <p className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: '#9B8CFF' }}>2.5D Top-Down</p>
          <p className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>Grid cells · red = multi-layer</p>
        </div>
      </div>

      {/* Side-by-side views */}
      <div className="grid grid-cols-2 gap-3">
        {/* LEFT: 3D Canvas */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: COLORS.accent + '66', backgroundColor: '#000000' }}>
          <canvas
            ref={canvasRef}
            width={600}
            height={600}
            style={{ width: '100%', aspectRatio: '1', display: 'block' }}
          />
        </div>

        {/* RIGHT: 2.5D SVG */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#9B8CFF66', backgroundColor: COLORS.panel }}>
          <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="2.5D height-layered map" style={{ display: 'block', backgroundColor: '#000000' }}>
            {resolvedCells.map((c, i) => (
              <rect
                key={i}
                x={c.x - c.cellSizePx / 2}
                y={c.y - c.cellSizePx / 2}
                width={c.cellSizePx}
                height={c.cellSizePx}
                fill={classColor(c.dominant_class)}
                opacity={c.layers.length > 1 ? 0.95 : 0.55}
                stroke={c.layers.length > 1 ? COLORS.alert : 'none'}
                strokeWidth={c.layers.length > 1 ? 1.5 : 0}
                onClick={() => setSelectedCell(c)}
                style={{ cursor: 'pointer' }}
              />
            ))}
            <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
          </svg>
        </div>
      </div>

      {/* 3D View Controls */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <p className="text-[10px] tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>3D View Controls</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-[11px] font-mono mb-1">
              <span style={{ color: COLORS.textMuted }}>Tilt angle</span>
              <span style={{ color: COLORS.accent }}>{tilt}°</span>
            </div>
            <input
              type="range" min={0} max={75} value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))}
              className="w-full accent-teal-400"
              style={{ accentColor: COLORS.accent }}
            />
            <div className="flex justify-between text-[10px] font-mono mt-0.5" style={{ color: COLORS.textFaint }}>
              <span>Top-down</span><span>Side view</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-mono mb-1">
              <span style={{ color: COLORS.textMuted }}>Rotation</span>
              <span style={{ color: COLORS.accent }}>{azimuth}°</span>
            </div>
            <input
              type="range" min={0} max={360} value={azimuth}
              onChange={(e) => setAzimuth(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: COLORS.accent }}
            />
            <div className="flex justify-between text-[10px] font-mono mt-0.5" style={{ color: COLORS.textFaint }}>
              <span>0°</span><span>360°</span>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <p className="text-[10px] tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.textFaint }}>Legend</p>
        <div className="flex flex-wrap gap-3 text-[11px] font-mono">
          {[['drivable', COLORS.drivable], ['non_drivable', COLORS.nonDrivable], ['static_obstacle', COLORS.staticObs], ['dynamic_object', COLORS.dynamicObj]].map(([cls, color]) => (
            <span key={cls} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              <span style={{ color: COLORS.textMuted }}>{cls}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border" style={{ borderColor: COLORS.alert, backgroundColor: 'transparent' }} />
            <span style={{ color: COLORS.textMuted }}>Multi-layer cell</span>
          </span>
        </div>
        <p className="text-[10px] mt-2 font-mono" style={{ color: COLORS.textFaint }}>
          3D view: elevated squares = height layers above ground · Use sliders to rotate and tilt · Click cells in 2.5D view to inspect
        </p>
      </div>
    </div>
  );
}



function AdaptiveGridView({ frame, bandConfig, pxPerM, rangeRingsPx, setSelectedCell, bandIndexByName, trackHistory }) {
  const resolvedCells = useMemo(() => resolveCells(frame, bandConfig, pxPerM), [frame, bandConfig, pxPerM]);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="rounded-lg border p-2" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
        <svg width="100%" viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} role="img" aria-label="Adaptive variable-resolution grid">
          {/* Range bands - semi-transparent backgrounds */}
          {rangeRingsPx.slice().reverse().map((ring, i) => (
            <circle key={`bg-${i}`} cx={CENTER} cy={CENTER} r={ring.r} fill={ring.color} opacity={0.08} />
          ))}

          {/* Band boundaries */}
          {rangeRingsPx.map((ring, i) => (
            <circle key={`border-${i}`} cx={CENTER} cy={CENTER} r={ring.r} fill="none" stroke={ring.color} strokeWidth={1} opacity={0.4} strokeDasharray="4,4" />
          ))}

          {/* Grid cells colored by band */}
          {resolvedCells.map((c, i) => {
            const bandIdx = bandIndexByName[c.band] ?? 0;
            const fill = COLORS.bandRamp[bandIdx % COLORS.bandRamp.length];
            return (
              <rect
                key={i}
                x={c.x - c.cellSizePx / 2}
                y={c.y - c.cellSizePx / 2}
                width={c.cellSizePx}
                height={c.cellSizePx}
                fill={fill}
                opacity={c.layers.length > 1 ? 0.9 : 0.5}
                stroke={c.layers.length > 1 ? COLORS.alert : 'none'}
                strokeWidth={c.layers.length > 1 ? 1 : 0}
                onClick={() => setSelectedCell(c)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {/* Track motion trails */}
          {Object.entries(trackHistory).map(([trackId, positions]) => {
            if (positions.length < 2) return null;
            return (
              <g key={`trail-${trackId}`}>
                {positions.slice(0, -1).map((pos, i) => {
                  const [x1, y1] = polarToXY(Math.hypot(pos.x_m, pos.y_m), (Math.atan2(pos.y_m, pos.x_m) * 180) / Math.PI, pxPerM);
                  const nextPos = positions[i + 1];
                  const [x2, y2] = polarToXY(Math.hypot(nextPos.x_m, nextPos.y_m), (Math.atan2(nextPos.y_m, nextPos.x_m) * 180) / Math.PI, pxPerM);
                  return (
                    <line key={`seg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.dynamicObj} strokeWidth={1.5} opacity={0.3 + i * 0.07} />
                  );
                })}
              </g>
            );
          })}

          {/* Current tracks */}
          {frame?.tracks?.map((t) => {
            const [x, y] = polarToXY(Math.hypot(t.x_m, t.y_m), (Math.atan2(t.y_m, t.x_m) * 180) / Math.PI, pxPerM);
            return (
              <g key={`track-${t.id}`}>
                <circle cx={x} cy={y} r={8} fill={COLORS.dynamicObj} opacity={0.2} />
                <rect x={x - 9} y={y - 7} width={18} height={14} rx={3} fill="none" stroke={COLORS.dynamicObj} strokeWidth={1.5} />
                <text x={x} y={y - 11} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="9" fill={COLORS.dynamicObj} fontWeight="bold">
                  #{t.id}
                </text>
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={3} fill={COLORS.accent} />
        </svg>
      </div>

      {/* Band legend and explanation */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
        <p className="text-xs tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Resolution Bands (Near to Far)</p>
        <div className="space-y-2">
          {bandConfig?.bands.map((b, i) => (
            <div key={b.name} className="flex items-start gap-3">
              <div className="w-3 h-3 mt-1 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.bandRamp[i % COLORS.bandRamp.length] }} />
              <div className="text-xs font-mono flex-1">
                <p style={{ color: COLORS.textPrimary }}>
                  {b.inner_radius_m}–{b.outer_radius_m}m: <span style={{ color: COLORS.accent }}>{(b.cell_size_m * 100).toFixed(0)} cm</span> cells, {b.max_height_layers} layer{b.max_height_layers !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why Adaptive */}
      <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
        <p className="text-xs tracking-widest font-mono uppercase mb-2" style={{ color: COLORS.accent }}>Why Adaptive Resolution?</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p style={{ color: COLORS.accent, fontWeight: 'bold' }}>NEAR FIELD</p>
            <p style={{ color: COLORS.textMuted }}>Fine detail needed</p>
          </div>
          <div>
            <p style={{ color: COLORS.textMuted, fontWeight: 'bold' }}>MID FIELD</p>
            <p style={{ color: COLORS.textMuted }}>Balanced</p>
          </div>
          <div>
            <p style={{ color: COLORS.textMuted, fontWeight: 'bold' }}>FAR FIELD</p>
            <p style={{ color: COLORS.textMuted }}>Reduce redundancy</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareView({ benchmark, loading, onRun, bandConfig }) {
  const uniformCells = benchmark?.uniform?.cell_count ?? 0;
  const adaptiveCells = benchmark?.adaptive?.cell_count ?? 0;
  const maxCells = Math.max(uniformCells, adaptiveCells, 1);

  const uniformMem = benchmark?.uniform?.estimated_memory_mb ?? 0;
  const adaptiveMem = benchmark?.adaptive?.estimated_memory_mb ?? 0;
  const maxMem = Math.max(uniformMem, adaptiveMem, 0.0001);

  const uniformLat = benchmark?.uniform?.build_latency_ms ?? 0;
  const adaptiveLat = benchmark?.adaptive?.build_latency_ms ?? 0;
  const maxLat = Math.max(uniformLat, adaptiveLat, 0.0001);

  const BAND_COLORS = ['#FF8552', '#E3B23C', '#59C1B0', '#3EA0D6'];

  return (
    <div className="w-full flex flex-col gap-4" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs tracking-widest font-mono uppercase font-bold" style={{ color: COLORS.textPrimary }}>
              Uniform vs. Adaptive — Measured Benchmark
            </p>
            <p className="text-xs mt-1 font-mono" style={{ color: COLORS.textFaint }}>
              {benchmark
                ? `Dataset: ${benchmark.input_point_count?.toLocaleString() ?? '—'} input points · ${adaptiveCells} adaptive cells vs ${uniformCells} uniform cells`
                : 'Run the benchmark to compare grid strategies on the active dataset'}
            </p>
          </div>
          <button
            onClick={onRun}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-md border text-xs font-mono uppercase font-bold transition-colors"
            style={{ borderColor: COLORS.accent, backgroundColor: loading ? COLORS.panelAlt : '#59C1B0', color: loading ? COLORS.accent : '#0B1016', opacity: loading ? 0.7 : 1 }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Running…' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {!benchmark ? (
        <div className="rounded-lg border p-10 flex flex-col items-center justify-center gap-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
          <RefreshCw size={28} style={{ color: COLORS.textFaint }} />
          <p className="text-xs font-mono text-center" style={{ color: COLORS.textMuted }}>
            Click <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Run Benchmark</span> to build both uniform and adaptive grids<br />
            from the same input scene and compare measured cell counts, memory, and build latency.
          </p>
        </div>
      ) : (
        <>
          {/* Visual Bar Chart Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Cell Count */}
            <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
              <p className="text-[10px] tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Cell Count</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: COLORS.textMuted }}>Uniform</span>
                    <span style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{uniformCells.toLocaleString()}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(uniformCells / maxCells) * 100}%`, backgroundColor: '#5B6672' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: COLORS.accent }}>Adaptive</span>
                    <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>{adaptiveCells.toLocaleString()}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(adaptiveCells / maxCells) * 100}%`, backgroundColor: COLORS.accent }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t text-center" style={{ borderColor: COLORS.border }}>
                  <span className="text-xs font-mono font-bold" style={{ color: COLORS.accent }}>
                    {benchmark.compression_ratio}× compression ratio
                  </span>
                </div>
              </div>
            </div>

            {/* Memory */}
            <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
              <p className="text-[10px] tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Est. Memory (MB)</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: COLORS.textMuted }}>Uniform</span>
                    <span style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{uniformMem.toFixed(4)}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(uniformMem / maxMem) * 100}%`, backgroundColor: '#5B6672' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: COLORS.accent }}>Adaptive</span>
                    <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>{adaptiveMem.toFixed(4)}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(adaptiveMem / maxMem) * 100}%`, backgroundColor: COLORS.accent }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t text-center" style={{ borderColor: COLORS.border }}>
                  <span className="text-xs font-mono font-bold" style={{ color: COLORS.accent }}>
                    {benchmark.memory_saved_mb} MB saved
                  </span>
                </div>
              </div>
            </div>

            {/* Build Latency */}
            <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
              <p className="text-[10px] tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Build Latency (ms)</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: COLORS.textMuted }}>Uniform</span>
                    <span style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{uniformLat.toFixed(4)}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(uniformLat / maxLat) * 100}%`, backgroundColor: '#5B6672' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span style={{ color: adaptiveLat < uniformLat ? COLORS.accent : COLORS.textMuted }}>Adaptive</span>
                    <span style={{ color: adaptiveLat < uniformLat ? COLORS.accent : COLORS.textPrimary, fontWeight: 'bold' }}>{adaptiveLat.toFixed(4)}</span>
                  </div>
                  <div className="h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{ width: `${(adaptiveLat / maxLat) * 100}%`, backgroundColor: adaptiveLat < uniformLat ? COLORS.accent : '#5B6672' }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t text-center" style={{ borderColor: COLORS.border }}>
                  <span className="text-xs font-mono font-bold" style={{ color: adaptiveLat < uniformLat ? COLORS.accent : COLORS.textMuted }}>
                    {adaptiveLat < uniformLat ? `✓ ${((1 - adaptiveLat / uniformLat) * 100).toFixed(1)}% faster` : 'Similar speed'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary table */}
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
            <div className="px-4 py-2 border-b" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panelAlt }}>
              <p className="text-[10px] tracking-widest font-mono uppercase" style={{ color: COLORS.textFaint }}>Full Metric Comparison</p>
            </div>
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th className="text-left py-2 px-4" style={{ color: COLORS.textFaint }}>Metric</th>
                  <th className="text-right py-2 px-4" style={{ color: COLORS.textFaint }}>Uniform</th>
                  <th className="text-right py-2 px-4" style={{ color: COLORS.textFaint }}>Adaptive</th>
                  <th className="text-right py-2 px-4" style={{ color: COLORS.accent }}>Result</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-2 px-4" style={{ color: COLORS.textMuted }}>Cell count</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.textPrimary }}>{uniformCells.toLocaleString()}</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.accent }}>{adaptiveCells.toLocaleString()}</td>
                  <td className="text-right py-2 px-4 font-bold" style={{ color: COLORS.accent }}>{benchmark.compression_ratio}× fewer</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-2 px-4" style={{ color: COLORS.textMuted }}>Memory (MB)</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.textPrimary }}>{uniformMem}</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.accent }}>{adaptiveMem}</td>
                  <td className="text-right py-2 px-4 font-bold" style={{ color: COLORS.accent }}>{benchmark.memory_saved_mb} MB saved</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-2 px-4" style={{ color: COLORS.textMuted }}>Build latency (ms)</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.textPrimary }}>{uniformLat}</td>
                  <td className="text-right py-2 px-4" style={{ color: adaptiveLat < uniformLat ? COLORS.accent : COLORS.textPrimary }}>{adaptiveLat}</td>
                  <td className="text-right py-2 px-4 font-bold" style={{ color: adaptiveLat < uniformLat ? COLORS.accent : COLORS.textMuted }}>
                    {adaptiveLat < uniformLat ? '✓ Faster' : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-4" style={{ color: COLORS.textMuted }}>Input points</td>
                  <td className="text-right py-2 px-4 col-span-2" style={{ color: COLORS.textPrimary }} colSpan={2}>{(benchmark.input_point_count ?? 0).toLocaleString()}</td>
                  <td className="text-right py-2 px-4" style={{ color: COLORS.textFaint }}>same dataset</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Adaptive band breakdown */}
          <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.panel }}>
            <p className="text-[10px] tracking-widest font-mono uppercase mb-3" style={{ color: COLORS.textFaint }}>Adaptive Grid — Cells Per Band</p>
            <div className="space-y-2">
              {Object.entries(benchmark.adaptive.cells_by_band).map(([bandName, count], idx) => {
                const band = bandConfig?.bands.find((b) => b.name === bandName);
                const pct = (count / Math.max(...Object.values(benchmark.adaptive.cells_by_band), 1)) * 100;
                return (
                  <div key={bandName} className="flex items-center gap-3">
                    <span className="w-28 text-[11px] font-mono shrink-0" style={{ color: BAND_COLORS[idx % BAND_COLORS.length] }}>
                      {bandName}
                    </span>
                    <div className="flex-1 h-5 rounded overflow-hidden" style={{ backgroundColor: '#1a2530' }}>
                      <div
                        className="h-full rounded flex items-center px-2 transition-all duration-700"
                        style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: BAND_COLORS[idx % BAND_COLORS.length] + '99' }}
                      >
                        <span className="text-[10px] font-mono font-bold" style={{ color: COLORS.textPrimary }}>
                          {count}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono shrink-0" style={{ color: COLORS.textFaint }}>
                      {band ? `${(band.cell_size_m * 100).toFixed(0)}cm cells` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Callout */}
          <div className="rounded-lg border p-4" style={{ borderColor: COLORS.accent + '44', backgroundColor: COLORS.panelAlt }}>
            <p className="text-xs font-mono" style={{ color: COLORS.textFaint }}>
              <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Input: </span>
              {(benchmark.input_point_count ?? 0).toLocaleString()} points &nbsp;·&nbsp;
              <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Overhang cells (adaptive): </span>
              {benchmark.adaptive.overhang_cells} &nbsp;·&nbsp;
              <span style={{ color: COLORS.accent, fontWeight: 'bold' }}>Compression: </span>
              {benchmark.compression_ratio}× (cell count ratio)
            </p>
            <p className="text-xs font-mono mt-2" style={{ color: COLORS.textFaint }}>
              This benchmark run is from a <strong style={{ color: COLORS.textMuted }}>single realistic sensor sweep</strong>. Compression ratios on real scenes are more modest than geometric estimates because not every cell gets populated. Near-field uses finer resolution cells; far-field uses coarser cells — same point coverage, fewer allocations.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

