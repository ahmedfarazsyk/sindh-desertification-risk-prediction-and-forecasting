// 'use client'

// import { useState, useEffect, useRef } from 'react';
// import dynamic from 'next/dynamic';
// import type { SelectionInfo } from '@/components/MapWidget';
// import SearchBar from '@/components/SearchBar';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';

// const MapWidget = dynamic(() => import('@/components/MapWidget'), {
//   ssr: false,
//   loading: () => <div className="h-screen w-screen flex items-center justify-center bg-slate-100 text-slate-500 animate-pulse font-semibold">Initializing Maps...</div>
// });

// const CHART_ORDER_CURRENT = ['dashboard', 'feature_importance', 'hexbin1', 'hexbin2', 'hexbins'];
// const CHART_ORDER_FORECAST = ['timelapse_gif', 'anomaly_map', 'trend', 'stacked_bar', 'seasonal', 'std_dev'];

// type ChatMessage = { role: 'user' | 'ai', text: string };

// // Helper to extract nested paths (safely handles both Polygons and disjointed MultiPolygons)
// const getPathsFromGeoJSON = (coordsArray: any[]) => {
//   const paths: any[] = [];
//   if (!coordsArray || !Array.isArray(coordsArray)) return paths;

//   const traverse = (node: any[]) => {
//     if (!Array.isArray(node) || node.length === 0) return;
    
//     // Check if the inner array contains direct coordinate pairs
//     if (Array.isArray(node[0]) && typeof node[0][0] === 'number') {
//       const path = node
//         .map(c => ({ lng: Number(c[0]), lat: Number(c[1]) }))
//         .filter(c => !isNaN(c.lng) && !isNaN(c.lat));
        
//       // Remove closing coordinate if it perfectly loops (GeoJSON Spec cleanup)
//       if (path.length > 1 && path[0].lng === path[path.length - 1].lng && path[0].lat === path[path.length - 1].lat) {
//         path.pop();
//       }
      
//       if (path.length > 0) paths.push(path);
//     } else {
//       // Keep digging into nested levels
//       for (const child of node) traverse(child);
//     }
//   };

//   traverse(coordsArray);
  
//   // If only 1 boundary exists, return 1D array. 
//   // If multiple exist, return 2D array so MapWidget draws them correctly disconnected.
//   return paths.length === 1 ? paths[0] : paths;
// };

// // Helper for UI Sidebar to safely flatten 2D arrays back into 1D for text rendering
// const getFlatCorners = (corners: any[]) => {
//   if (!corners || corners.length === 0) return [];
//   if (corners[0] && corners[0].lat !== undefined) return corners; 
//   return corners.flat(); 
// };

// export default function Home() {
//   const [activeTab, setActiveTab] = useState<'current' | 'forecast'>('current');
//   const [selection, setSelection] = useState<SelectionInfo | null>(null);
//   const [historySelection, setHistorySelection] = useState<SelectionInfo | null>(null);
//   const [isLoading, setIsLoading] = useState<boolean>(false);
  
//   // Results & Database State
//   const [baselineData, setBaselineData] = useState<any | null>(null);
//   const [forecastData, setForecastData] = useState<any | null>(null);
//   const [results, setResults] = useState<Record<string, string> | null>(null);
//   const [lastAnalyzedCoords, setLastAnalyzedCoords] = useState<string>('');
//   const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  
//   // Gemini Report State
//   const [aiReport, setAiReport] = useState<string | null>(null);
//   const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
//   const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false); 

//   // Multi-Modal RAG Chat State (Full Page Modal)
//   const [isRagPageOpen, setIsRagPageOpen] = useState<boolean>(false);
//   const [ragMessages, setRagMessages] = useState<ChatMessage[]>([]);
//   const [ragInput, setRagInput] = useState<string>("");
//   const [isRagLoading, setIsRagLoading] = useState<boolean>(false);
//   const chatEndRef = useRef<HTMLDivElement>(null);

//   // History State
//   const [history, setHistory] = useState<any[]>([]);
//   const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

//   // UI States
//   const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
//   const [fullScreenKey, setFullScreenKey] = useState<string | null>(null);
//   const [isReplayingGif, setIsReplayingGif] = useState<boolean>(false); 
//   const [replayTick, setReplayTick] = useState<number>(0); 

//   // Map Controls State
//   const [selectionMode, setSelectionMode] = useState<'square' | 'freeform'>('square');

//   useEffect(() => {
//     fetchHistory();
//   }, []);

//   // Handle Tab Switching for searched dual-data
//   useEffect(() => {
//     if (activeTab === 'current' && baselineData) {
//       setResults(baselineData.visualizations);
//       setActiveAnalysisId(baselineData.id);
//     } else if (activeTab === 'forecast' && forecastData) {
//       setResults(forecastData.visualizations);
//       setActiveAnalysisId(forecastData.id);
//     }
//   }, [activeTab, baselineData, forecastData]);

//   // Scroll Chat to bottom
//   useEffect(() => {
//     if (chatEndRef.current) {
//       chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
//     }
//   }, [ragMessages, isRagLoading]);

//   const fetchHistory = async () => {
//     try {
//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history`);
//       if (response.ok) {
//         const data = await response.json();
//         setHistory(data);
//       }
//     } catch (error) {
//       console.error("Failed to fetch history:", error);
//     }
//   };

//   const handleDistrictSearch = async (name: string) => {
//     setIsLoading(true);
//     setRagMessages([]); // Clear chat for new district
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/district/${name}`);
//       if (!res.ok) throw new Error("District not found");
//       const data = await res.json();
      
//       setBaselineData(data.baseline);
//       setForecastData(data.forecast);
      
//       // Default to baseline
//       setResults(data.baseline.visualizations);
//       setActiveTab('current');
//       setActiveAnalysisId(data.baseline.id);
//       setIsSidebarOpen(true);
      
//       if (data.baseline.coordinates && data.baseline.coordinates.length > 0) {
//         const loadedCorners = getPathsFromGeoJSON(data.baseline.coordinates);
        
//         const sel = { 
//           coords: data.baseline.coordinates, // Preserve the original full nested payload
//           areaSqKm: data.baseline.area_sq_km || 0, 
//           corners: loadedCorners 
//         };
        
//         setSelectionMode('freeform');
//         setSelection(sel);
//         setHistorySelection(sel);
//       }
//     } catch (error) {
//       alert("Failed to load district data. Make sure backend is running.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleSendRagMessage = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!ragInput.trim()) return;

//     const userMsg: ChatMessage = { role: 'user', text: ragInput };
    
//     // 1. Update UI with User Message and placeholder AI message
//     setRagMessages(prev => [...prev, userMsg, { role: 'ai', text: "" }]);
//     setRagInput("");
//     setIsRagLoading(true);

//     try {
//       // 2. Prepare History for Backend Memory
//       // Convert our UI messages to Gemini's expected format: { role: 'user'|'model', parts: [{ text: '...' }] }
//       const history = ragMessages.map(m => ({
//         role: m.role === 'user' ? 'user' : 'model',
//         parts: [{ text: m.text }]
//       }));

//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ query: userMsg.text, history })
//       });

//       if (!response.ok || !response.body) throw new Error("Streaming failed");

//       // 3. Read the Stream
//       const reader = response.body.getReader();
//       const decoder = new TextDecoder();
//       let accumulatedText = "";

//       while (true) {
//         const { value, done } = await reader.read();
//         if (done) break;

//         const chunk = decoder.decode(value, { stream: true });
//         accumulatedText += chunk;

//         // 4. Update the LAST message in the list (the AI's text) in real-time
//         setRagMessages(prev => {
//           const newMessages = [...prev];
//           newMessages[newMessages.length - 1] = { role: 'ai', text: accumulatedText };
//           return newMessages;
//         });
//       }
//     } catch (error) {
//       console.error("Stream Error:", error);
//       setRagMessages(prev => [
//         ...prev.slice(0, -1), // Remove the empty AI message
//         { role: 'ai', text: "❌ Connection error. Please ensure the backend is running and try again." }
//       ]);
//     } finally {
//       setIsRagLoading(false);
//     }
//   };

//   const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
//     e.stopPropagation();
//     if (!confirm("Are you sure you want to delete this analysis?")) return;

//     try {
//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history/${id}`, {
//         method: 'DELETE',
//       });
//       if (response.ok) {
//         setHistory(prev => prev.filter(item => item.id !== id));
//         if (activeAnalysisId === id) {
//           setResults(null);
//           setAiReport(null);
//           setActiveAnalysisId(null);
//         }
//       }
//     } catch (error) {
//       console.error("Delete failed:", error);
//     }
//   };

//   const loadHistoryItem = (item: any) => {
//     setBaselineData(null); 
//     setForecastData(null);

//     setResults(item.visualizations);
//     setActiveTab(item.analysis_type);
//     setActiveAnalysisId(item.id);
//     setAiReport(item.ai_report || null); 
    
//     setIsSidebarOpen(true);
//     setIsHistoryOpen(false);
    
//     if (item.coordinates && item.coordinates.length > 0) {
//       const loadedCorners = getPathsFromGeoJSON(item.coordinates);

//       const sel = {
//         coords: item.coordinates, 
//         areaSqKm: item.area_sq_km || 0,
//         corners: loadedCorners
//       };
      
//       setSelectionMode('freeform'); 
//       setSelection(sel);
//       setHistorySelection(sel); 
//     }
//   };

//   const handleSelectionChange = (info: SelectionInfo | null) => {
//     setSelection(info);
//     if (!info) {
//       setHistorySelection(null); 
//     }
//   };

//   const formatTitle = (key: string) => {
//     return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
//   };

//   const getImageSrc = (key: string, value: string) => {
//     if (value.startsWith('http')) return value;
//     return key.includes('gif') ? `data:image/gif;base64,${value}` : `data:image/png;base64,${value}`;
//   };

//   const runAnalysis = async () => {
//     if (!selection) return;
//     setIsLoading(true);
    
//     const currentCoordsStr = JSON.stringify(selection.coords);
//     if (currentCoordsStr !== lastAnalyzedCoords) {
//       setResults(null); 
//       setAiReport(null);
//       setActiveAnalysisId(null);
//       setLastAnalyzedCoords(currentCoordsStr);
//       setBaselineData(null); 
//       setForecastData(null);
//     }

//     if (!isSidebarOpen) setIsSidebarOpen(true);

//     try {
//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze/${activeTab}`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ 
//           coordinates: selection.coords,
//           area_sq_km: selection.areaSqKm 
//         }),
//       });

//       if (!response.ok) throw new Error(`API Error: ${response.status}`);
//       const data = await response.json();
      
//       setResults(prev => ({ ...(prev || {}), ...data.visualizations }));
//       setActiveAnalysisId(data.analysis_id); 
//       fetchHistory(); 
      
//     } catch (error) {
//       console.error(error);
//       alert("Error connecting to the backend. Ensure FastAPI is running.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleReportClick = async () => {
//     if (!activeAnalysisId) return;
//     if (aiReport) {
//       setIsReportModalOpen(true);
//       return;
//     }
//     if (!confirm("Would you like Gemini to analyze these visuals and generate a scientific report?")) return;
    
//     setIsGeneratingReport(true);
//     setIsReportModalOpen(true); 

//     try {
//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history/${activeAnalysisId}/report`, {
//         method: 'POST'
//       });
//       if (!response.ok) throw new Error("Failed to generate report");
//       const data = await response.json();
//       setAiReport(data.report);
//       fetchHistory(); 
//     } catch (error) {
//       console.error(error);
//       alert("Failed to generate AI report.");
//       setIsReportModalOpen(false); 
//     } finally {
//       setIsGeneratingReport(false);
//     }
//   };

//   const downloadPDF = () => {
//     const element = document.getElementById('ai-report-content');
//     if (!element) return;
//     const printWindow = window.open('', '', 'width=900,height=800');
//     if (!printWindow) {
//         alert("Please allow popups to download the PDF.");
//         return;
//     }
//     printWindow.document.write(`
//       <!DOCTYPE html>
//       <html>
//         <head>
//           <title>GeoAI Scientific Report</title>
//           <script src="https://cdn.tailwindcss.com"></script>
//         </head>
//         <body class="p-10 bg-white text-slate-800 font-sans">
//           <div class="max-w-4xl mx-auto prose prose-slate">
//             ${element.innerHTML}
//           </div>
//         </body>
//       </html>
//     `);
//     printWindow.document.close();
//     printWindow.focus();
//     setTimeout(() => {
//       printWindow.print();
//       printWindow.close();
//     }, 750);
//   };

//   const handleReplayGif = () => {
//     setIsReplayingGif(true);
//     setTimeout(() => {
//       setReplayTick(prev => prev + 1);
//       setIsReplayingGif(false);
//     }, 50);
//   };

//   const renderKeys = results 
//     ? (activeTab === 'current' ? CHART_ORDER_CURRENT : CHART_ORDER_FORECAST).filter(k => results[k])
//     : [];

//   return (
//     <main className="relative w-screen h-screen bg-slate-200 overflow-hidden font-sans">
      
//       {/* 1. BACKGROUND MAP */}
//       <div className="absolute inset-0 w-screen h-screen z-0">
//         <MapWidget 
//           onSelectionChange={handleSelectionChange} 
//           selectionMode={selectionMode}
//           historySelection={historySelection}
//         />
//       </div>

//       {/* 2. DYNAMIC CENTER TOP TOOLBAR (Search, Map Tools, RAG) */}
//       <div 
//         className={`absolute top-6 left-0 right-0 z-20 pointer-events-none flex justify-center transition-all duration-300 ease-in-out
//           ${isSidebarOpen ? 'md:ml-[450px] lg:ml-[500px]' : ''}
//           ${isHistoryOpen ? 'md:mr-[350px] lg:mr-[400px]' : ''}
//         `}
//       >
//         <div className="pointer-events-auto flex flex-col md:flex-row items-center gap-3">
          
//           <SearchBar onSelect={handleDistrictSearch} />
          
//           <div className="bg-white p-1.5 rounded-full shadow-xl border border-slate-200 flex items-center gap-1">
//             <button
//               onClick={() => { setSelectionMode('square'); handleSelectionChange(null); }} 
//               className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
//                 selectionMode === 'square' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
//               }`}
//             >
//               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"></rect></svg>
//               Square
//             </button>
//             <button
//               onClick={() => { setSelectionMode('freeform'); handleSelectionChange(null); }}
//               className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
//                 selectionMode === 'freeform' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
//               }`}
//             >
//               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 16v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3"></path></svg>
//               Free-form
//             </button>
//           </div>

//           <button
//             onClick={() => setIsRagPageOpen(true)}
//             className="bg-purple-600 hover:bg-purple-700 text-white p-1.5 pr-5 rounded-full shadow-xl border border-purple-500 flex items-center gap-3 transition-all hover:scale-105"
//           >
//             <div className="bg-white text-purple-600 p-2 rounded-full">
//               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
//             </div>
//             <span className="font-bold text-sm tracking-wide">Copilot</span>
//           </button>
//         </div>
//       </div>

//       {/* 3. FULL PAGE RAG CHAT (GeoAI Copilot) */}
//       {isRagPageOpen && (
//         <div className="fixed inset-0 z-[10000] bg-slate-50 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-200">
//           <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
//             <div className="flex items-center gap-4">
//               <button 
//                 onClick={() => setIsRagPageOpen(false)} 
//                 className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
//               >
//                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
//               </button>
//               <div>
//                 <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
//                   <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
//                   GeoAI Multimodal Copilot
//                 </h1>
//                 <p className="text-sm text-slate-500 font-medium">Ask questions across all analyzed districts in the database.</p>
//               </div>
//             </div>
//           </header>

//           <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
//             <div className="max-w-4xl mx-auto flex flex-col gap-6">
              
//               <div className="flex gap-4">
//                 <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
//                   <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
//                 </div>
//                 <div className="bg-white p-5 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-800">
//                   <p>Hello! I am your GeoAI Copilot. You can ask me questions about any pre-computed district, such as <strong>"Which district has the highest desertification?"</strong> or <strong>"What is causing severe risk in Badin District?"</strong></p>
//                 </div>
//               </div>

//               {ragMessages.map((msg, idx) => (
//                 <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
//                   <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-purple-100 text-purple-600'}`}>
//                     {msg.role === 'user' ? (
//                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
//                     ) : (
//                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
//                     )}
//                   </div>
//                   <div className={`p-5 rounded-2xl shadow-sm max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 rounded-tl-none text-slate-800 prose prose-slate prose-img:rounded-xl'}`}>
//                     {msg.role === 'ai' && msg.text === "" && isRagLoading ? (
//                       <div className="flex items-center gap-2 min-h-[24px]">
//                         <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
//                         <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
//                         <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
//                       </div>
//                     ) : (
//                       <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
//                     )}
//                   </div>
//                 </div>
//               ))}

//               {/* {isRagLoading && ragMessages[ragMessages.length - 1]?.text === "" && (
//                 <div className="flex gap-4">
//                   <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
//                     <svg className="animate-spin w-5 h-5 text-purple-600" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
//                   </div>
//                   <div className="bg-white p-5 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 flex items-center gap-2">
//                     <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
//                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
//                     <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
//                   </div>
//                 </div>
//               )} */}
//               <div ref={chatEndRef} />
//             </div>
//           </div>

//           <div className="bg-white border-t border-slate-200 p-4">
//             <form onSubmit={handleSendRagMessage} className="max-w-4xl mx-auto flex gap-4 relative">
//               <input 
//                 type="text" 
//                 value={ragInput}
//                 onChange={(e) => setRagInput(e.target.value)}
//                 placeholder="Ask about drivers, forecasts, or compare districts..." 
//                 className="flex-1 bg-slate-100 border-none rounded-full py-4 pl-6 pr-16 text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:outline-none"
//                 disabled={isRagLoading}
//               />
//               <button 
//                 type="submit" 
//                 disabled={isRagLoading || !ragInput.trim()}
//                 className="absolute right-2 top-2 bottom-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white w-12 rounded-full flex items-center justify-center transition-colors"
//               >
//                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
//               </button>
//             </form>
//           </div>
//         </div>
//       )}

//       {/* 4. FULLSCREEN LIGHTBOX MODAL */}
//       {fullScreenKey && results && results[fullScreenKey] && !isRagPageOpen && (
//         <div className="fixed inset-0 z-[9999] bg-black bg-opacity-95 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-sm">
//           <div className="absolute top-6 right-6 flex gap-4">
//             {fullScreenKey.includes('gif') && (
//               <button 
//                 onClick={handleReplayGif} 
//                 className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
//               >
//                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
//                 Replay GIF
//               </button>
//             )}
//             <button 
//               onClick={() => setFullScreenKey(null)} 
//               className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-lg font-bold transition-colors"
//             >
//               Close
//             </button>
//           </div>
          
//           {!isReplayingGif && (
//             <img 
//               key={`${fullScreenKey}-${replayTick}`} 
//               src={getImageSrc(fullScreenKey, results[fullScreenKey])} 
//               alt="Fullscreen Visualization" 
//               className="max-w-full max-h-full object-contain rounded shadow-2xl"
//             />
//           )}
//         </div>
//       )}

//       {/* 5. GEMINI REPORT MODAL WINDOW */}
//       {isReportModalOpen && !isRagPageOpen && (
//         <div className="fixed inset-0 z-[9999] bg-slate-900 bg-opacity-80 flex justify-center items-start overflow-y-auto p-4 md:p-8 backdrop-blur-sm">
//           <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl relative my-auto overflow-hidden flex flex-col max-h-[90vh]">
//             <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 flex-shrink-0">
//               <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
//                 <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
//                 AI Scientific Report
//               </h2>
//               <div className="flex items-center gap-3">
//                 {aiReport && !isGeneratingReport && (
//                   <button 
//                     onClick={downloadPDF}
//                     className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
//                   >
//                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
//                     Download PDF
//                   </button>
//                 )}
//                 <button 
//                   onClick={() => setIsReportModalOpen(false)} 
//                   className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
//                 >
//                   Close
//                 </button>
//               </div>
//             </div>
//             <div className="p-8 overflow-y-auto flex-1 bg-slate-50">
//               {isGeneratingReport ? (
//                 <div className="flex flex-col items-center justify-center py-20">
//                   <svg className="animate-spin w-12 h-12 text-purple-600 mb-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
//                   <p className="text-xl font-bold text-slate-800 mb-2">Gemini is analyzing spatial data...</p>
//                   <p className="text-slate-500 font-medium">Drafting environmental summary and actionable insights.</p>
//                 </div>
//               ) : aiReport ? (
//                 <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
//                   <div id="ai-report-content" className="prose prose-slate max-w-none prose-img:rounded-xl prose-img:shadow-md prose-headings:text-slate-800 prose-a:text-blue-600">
//                     <ReactMarkdown remarkPlugins={[remarkGfm]}>
//                       {aiReport}
//                     </ReactMarkdown>
//                   </div>
//                 </div>
//               ) : null}
//             </div>
//           </div>
//         </div>
//       )}

//       {/* 6. GROUPED FLOATING TOGGLE BUTTONS (Left Side, cleanly anchored relative to Sidebar) */}
//       <div 
//         className={`absolute top-6 z-20 flex items-center gap-3 transition-all duration-300 ease-in-out ${
//           isSidebarOpen ? 'left-[calc(100vw-4rem)] md:left-[470px] lg:left-[520px]' : 'left-6'
//         }`}
//       >
//         {activeAnalysisId && activeAnalysisId.length > 24 && (
//           <button 
//             onClick={handleReportClick}
//             title={aiReport ? "View Generated Report" : "Generate Gemini AI Report"}
//             className={`p-3 rounded-full shadow-lg border flex items-center gap-2 font-bold transition-all duration-300 ease-in-out hover:scale-105 ${
//               aiReport 
//                 ? 'bg-purple-100 text-purple-700 border-purple-300' 
//                 : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-transparent'
//             }`}
//           >
//             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
//           </button>
//         )}

//         <button 
//           onClick={() => setIsSidebarOpen(!isSidebarOpen)}
//           className="bg-white text-slate-800 p-3 rounded-full shadow-xl border border-slate-200 flex items-center gap-2 font-bold transition-colors hover:bg-slate-50"
//         >
//           {isSidebarOpen ? (
//             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
//           ) : (
//             <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg> Analysis Panel</>
//           )}
//         </button>
//       </div>

//       {/* 7. HISTORY PANEL TOGGLE: Fixed safely at the bottom right */}
//       <button 
//         onClick={() => setIsHistoryOpen(true)}
//         className={`absolute bottom-6 right-6 z-20 bg-white text-slate-800 p-4 rounded-full shadow-xl border border-slate-200 flex items-center justify-center font-bold transition-all duration-300 ease-in-out hover:bg-slate-50 hover:scale-105 ${
//           isHistoryOpen ? 'opacity-0 pointer-events-none translate-y-10' : 'opacity-100 translate-y-0'
//         }`}
//         title="View History"
//       >
//         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
//       </button>

//       {/* 8. FOREGROUND SIDEBAR (Analysis Panel) */}
//       <div 
//         className={`absolute top-0 left-0 h-full bg-white shadow-[10px_0_30px_rgba(0,0,0,0.15)] z-10 flex flex-col transition-transform duration-300 ease-in-out w-full md:w-[450px] lg:w-[500px] ${
//           isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
//         }`}
//       >
//         <div className="flex-shrink-0 flex flex-col">
//           <div className="p-6 border-b border-slate-100 bg-blue-600 text-white">
//             <div className="flex items-center gap-3 mb-1">
//               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
//               <h1 className="text-2xl font-bold tracking-tight">GeoAI Analytics</h1>
//             </div>
//             <p className="text-blue-100 text-sm font-medium">Desertification Risk Assessment Platform</p>
//           </div>

//           <div className="flex p-4 border-b border-slate-200 bg-slate-50 gap-2 shadow-sm z-10">
//             <button 
//               onClick={() => setActiveTab('current')}
//               className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'current' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}
//             >
//               Baseline Analysis
//             </button>
//             <button 
//               onClick={() => setActiveTab('forecast')}
//               disabled={!forecastData && !selection}
//               className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'forecast' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
//             >
//               5-Year Forecast
//             </button>
//           </div>
//         </div>

//         <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
//           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
//             {selection ? (
//               <div className="mb-5 bg-blue-50 border border-blue-100 p-4 rounded-lg">
//                 <div className="flex justify-between items-center mb-3">
//                   <span className="text-sm font-bold text-blue-800 uppercase tracking-wider">
//                     {baselineData ? baselineData.district_name : 'Region of Interest'}
//                   </span>
//                   <div className="flex items-center gap-2">
//                     {Array.isArray(selection.corners) && Array.isArray(selection.corners[0]) && (
//                       <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
//                         {selection.corners.length} Parts
//                       </span>
//                     )}
//                     <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
//                       ~{selection.areaSqKm.toFixed(2)} km²
//                     </span>
//                   </div>
//                 </div>
//                 <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
//                   {getFlatCorners(selection.corners).slice(0, 4).map((c: any, i: number) => (
//                     c?.lat !== undefined && c?.lng !== undefined && !isNaN(c.lat) && !isNaN(c.lng) ? (
//                       <div key={i} className="bg-white p-1.5 rounded border border-slate-200 text-center shadow-sm">
//                         {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
//                       </div>
//                     ) : null
//                   ))}
//                 </div>
//               </div>
//             ) : (
//               <p className="text-center text-sm text-amber-600 mb-5 font-semibold bg-amber-50 py-3 rounded-lg border border-amber-200">
//                 Search a district or select a region to begin.
//               </p>
//             )}

//             <button
//               onClick={runAnalysis}
//               disabled={!selection || isLoading}
//               className={`w-full py-3 rounded-lg text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md
//                 ${!selection ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700'}`}
//             >
//               {isLoading ? (
//                 <><svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Computing...</>
//               ) : (
//                 <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Execute {activeTab === 'current' ? 'Model A' : 'Model B'}</>
//               )}
//             </button>
//           </div>

//           {!isLoading && renderKeys.length === 0 && (
//             <div className="py-12 flex flex-col items-center justify-center text-slate-400 opacity-70">
//               <svg className="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
//               <p className="text-lg font-medium">Awaiting Telemetry</p>
//             </div>
//           )}

//           {isLoading && (
//             <div className="py-12 flex flex-col items-center justify-center text-blue-600">
//               <svg className="animate-spin w-16 h-16 mb-6 opacity-80" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
//               <p className="font-bold text-lg animate-pulse">Running Neural Network...</p>
//               <p className="text-sm text-slate-500 mt-2 text-center max-w-xs">
//                 {activeTab === 'current' ? 'Processing 33-band composite stack.' : 'Unrolling ConvGRU sequence. This may take a few minutes.'}
//               </p>
//             </div>
//           )}

//           {results && renderKeys.length > 0 && (
//             <div className="flex flex-col gap-6 pb-8">
//               {renderKeys.map((key) => (
//                 <div 
//                   key={key} 
//                   className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
//                   onClick={() => { setFullScreenKey(key); setReplayTick(0); setIsReplayingGif(false); }}
//                 >
//                   <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
//                     <h3 className="font-bold text-slate-700">{formatTitle(key)}</h3>
//                     <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
//                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
//                       Expand
//                     </span>
//                   </div>
//                   <div className="p-2 relative bg-white flex justify-center">
//                     {key.includes('gif') && (
//                       <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white text-xs font-bold px-2 py-1 rounded z-10">GIF</div>
//                     )}
//                     <img 
//                       src={getImageSrc(key, results[key])} 
//                       alt={key} 
//                       className="w-full h-auto object-contain rounded pointer-events-none"
//                     />
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>

//       {/* 9. RIGHT SIDEBAR (History Panel) */}
//       <div 
//         className={`absolute top-0 right-0 h-full bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.15)] z-10 flex flex-col transition-transform duration-300 ease-in-out w-full md:w-[350px] lg:w-[400px] ${
//           isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
//         }`}
//       >
//         <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-shrink-0">
//           <h2 className="text-xl font-bold text-slate-800">History</h2>
//           <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
//             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
//           </button>
//         </div>

//         <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100">
//           {history.length === 0 ? (
//             <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-70">
//               <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
//               <p className="text-sm font-medium">No previous analysis found</p>
//             </div>
//           ) : (
//             history.map((item) => (
//               <div 
//                 key={item.id} 
//                 onClick={() => loadHistoryItem(item)}
//                 className={`bg-white p-4 rounded-xl shadow-sm border cursor-pointer transition-all relative group ${
//                   activeAnalysisId === item.id ? 'border-purple-400 ring-2 ring-purple-100' : 'border-slate-200 hover:border-blue-400'
//                 }`}
//               >
//                 <button 
//                   onClick={(e) => deleteHistoryItem(e, item.id)}
//                   className="absolute top-3 right-3 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
//                   title="Delete Analysis"
//                 >
//                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
//                 </button>
//                 <div className="flex items-center gap-2 mb-2">
//                   <span className={`w-2 h-2 rounded-full ${item.analysis_type === 'current' ? 'bg-teal-500' : 'bg-orange-500'}`}></span>
//                   <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
//                     {item.analysis_type === 'current' ? 'Baseline Analysis' : '5-Year Forecast'}
//                   </span>
//                   {item.ai_report && (
//                     <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded ml-auto flex items-center gap-1">
//                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
//                       Report
//                     </span>
//                   )}
//                 </div>
//                 <p className="text-sm font-bold text-slate-800">Area: {Number(item.area_sq_km).toFixed(2)} km²</p>
//                 <p className="text-[11px] text-slate-400 mt-2 font-mono">
//                   {new Date(item.created_at).toLocaleString(undefined, {
//                     dateStyle: 'medium',
//                     timeStyle: 'short'
//                   })}
//                 </p>
//               </div>
//             ))
//           )}
//         </div>
//       </div>
      
//     </main>
//   );
// }


'use client'

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { SelectionInfo } from '@/components/MapWidget';
import SearchBar from '@/components/SearchBar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MapWidget = dynamic(() => import('@/components/MapWidget'), {
  ssr: false,
  loading: () => <div className="h-screen w-screen flex items-center justify-center bg-slate-100 text-slate-500 animate-pulse font-semibold">Initializing Maps...</div>
});

const CHART_ORDER_CURRENT = ['dashboard', 'feature_importance', 'hexbin1', 'hexbin2', 'hexbins'];
const CHART_ORDER_FORECAST = ['timelapse_gif', 'anomaly_map', 'trend', 'stacked_bar', 'seasonal', 'std_dev'];

type ChatMessage = { role: 'user' | 'ai', text: string };

// Helper to extract nested paths (safely handles both Polygons and disjointed MultiPolygons)
const getPathsFromGeoJSON = (coordsArray: any[]) => {
  const paths: any[] = [];
  if (!coordsArray || !Array.isArray(coordsArray)) return paths;

  const traverse = (node: any[]) => {
    if (!Array.isArray(node) || node.length === 0) return;
    
    // Check if the inner array contains direct coordinate pairs
    if (Array.isArray(node[0]) && typeof node[0][0] === 'number') {
      const path = node
        .map(c => ({ lng: Number(c[0]), lat: Number(c[1]) }))
        .filter(c => !isNaN(c.lng) && !isNaN(c.lat));
        
      // Remove closing coordinate if it perfectly loops (GeoJSON Spec cleanup)
      if (path.length > 1 && path[0].lng === path[path.length - 1].lng && path[0].lat === path[path.length - 1].lat) {
        path.pop();
      }
      
      if (path.length > 0) paths.push(path);
    } else {
      // Keep digging into nested levels
      for (const child of node) traverse(child);
    }
  };

  traverse(coordsArray);
  
  // If only 1 boundary exists, return 1D array. 
  // If multiple exist, return 2D array so MapWidget draws them correctly disconnected.
  return paths.length === 1 ? paths[0] : paths;
};

// Helper for UI Sidebar to safely flatten 2D arrays back into 1D for text rendering
const getFlatCorners = (corners: any[]) => {
  if (!corners || corners.length === 0) return [];
  if (corners[0] && corners[0].lat !== undefined) return corners; 
  return corners.flat(); 
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<'current' | 'forecast'>('current');
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [historySelection, setHistorySelection] = useState<SelectionInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Results & Database State
  const [baselineData, setBaselineData] = useState<any | null>(null);
  const [forecastData, setForecastData] = useState<any | null>(null);
  const [results, setResults] = useState<Record<string, string> | null>(null);
  const [lastAnalyzedCoords, setLastAnalyzedCoords] = useState<string>('');
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  
  // Gemini Report State
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false); 

  // Multi-Modal RAG Chat State (Full Page Modal)
  const [isRagPageOpen, setIsRagPageOpen] = useState<boolean>(false);
  const [ragMessages, setRagMessages] = useState<ChatMessage[]>([]);
  const [ragInput, setRagInput] = useState<string>("");
  const [isRagLoading, setIsRagLoading] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // History State
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [fullScreenKey, setFullScreenKey] = useState<string | null>(null);
  const [isReplayingGif, setIsReplayingGif] = useState<boolean>(false); 
  const [replayTick, setReplayTick] = useState<number>(0); 

  // Map Controls State
  const [selectionMode, setSelectionMode] = useState<'square' | 'freeform'>('square');

  useEffect(() => {
    fetchHistory();
  }, []);

  // Handle Tab Switching for searched dual-data
  useEffect(() => {
    if (activeTab === 'current' && baselineData) {
      setResults(baselineData.visualizations);
      setActiveAnalysisId(baselineData.id);
    } else if (activeTab === 'forecast' && forecastData) {
      setResults(forecastData.visualizations);
      setActiveAnalysisId(forecastData.id);
    }
  }, [activeTab, baselineData, forecastData]);

  // Scroll Chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ragMessages, isRagLoading]);

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleDistrictSearch = async (name: string) => {
    setIsLoading(true);
    setRagMessages([]); // Clear chat for new district
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/district/${name}`);
      if (!res.ok) throw new Error("District not found");
      const data = await res.json();
      
      setBaselineData(data.baseline);
      setForecastData(data.forecast);
      
      // Default to baseline
      setResults(data.baseline.visualizations);
      setActiveTab('current');
      setActiveAnalysisId(data.baseline.id);
      setIsSidebarOpen(true);
      
      if (data.baseline.coordinates && data.baseline.coordinates.length > 0) {
        const loadedCorners = getPathsFromGeoJSON(data.baseline.coordinates);
        
        const sel = { 
          coords: data.baseline.coordinates, // Preserve the original full nested payload
          areaSqKm: data.baseline.area_sq_km || 0, 
          corners: loadedCorners 
        };
        
        setSelectionMode('freeform');
        setSelection(sel);
        setHistorySelection(sel);
      }
    } catch (error) {
      alert("Failed to load district data. Make sure backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRagMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragInput.trim()) return;

    const userMsg: ChatMessage = { role: 'user', text: ragInput };
    
    // 1. Update UI with User Message and placeholder AI message
    setRagMessages(prev => [...prev, userMsg, { role: 'ai', text: "" }]);
    setRagInput("");
    setIsRagLoading(true);

    try {
      // 2. Prepare History for Backend Memory
      const history = ragMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.text, history })
      });

      if (!response.ok || !response.body) throw new Error("Streaming failed");

      // 3. Read the Stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        // 4. Update the LAST message in the list (the AI's text) in real-time
        setRagMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'ai', text: accumulatedText };
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Stream Error:", error);
      setRagMessages(prev => [
        ...prev.slice(0, -1), // Remove the empty AI message
        { role: 'ai', text: "❌ Connection error. Please ensure the backend is running and try again." }
      ]);
    } finally {
      setIsRagLoading(false);
    }
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this analysis?")) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
        if (activeAnalysisId === id) {
          setResults(null);
          setAiReport(null);
          setActiveAnalysisId(null);
        }
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const loadHistoryItem = (item: any) => {
    setBaselineData(null); 
    setForecastData(null);

    setResults(item.visualizations);
    setActiveTab(item.analysis_type);
    setActiveAnalysisId(item.id);
    setAiReport(item.ai_report || null); 
    
    setIsSidebarOpen(true);
    setIsHistoryOpen(false);
    
    if (item.coordinates && item.coordinates.length > 0) {
      const loadedCorners = getPathsFromGeoJSON(item.coordinates);

      const sel = {
        coords: item.coordinates, 
        areaSqKm: item.area_sq_km || 0,
        corners: loadedCorners
      };
      
      setSelectionMode('freeform'); 
      setSelection(sel);
      setHistorySelection(sel); 
    }
  };

  const handleSelectionChange = (info: SelectionInfo | null) => {
    setSelection(info);
    if (!info) {
      setHistorySelection(null); 
    }
  };

  const formatTitle = (key: string) => {
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getImageSrc = (key: string, value: string) => {
    if (value.startsWith('http')) return value;
    return key.includes('gif') ? `data:image/gif;base64,${value}` : `data:image/png;base64,${value}`;
  };

  const runAnalysis = async () => {
    if (!selection) return;
    setIsLoading(true);
    
    const currentCoordsStr = JSON.stringify(selection.coords);
    if (currentCoordsStr !== lastAnalyzedCoords) {
      setResults(null); 
      setAiReport(null);
      setActiveAnalysisId(null);
      setLastAnalyzedCoords(currentCoordsStr);
      setBaselineData(null); 
      setForecastData(null);
    }

    if (!isSidebarOpen) setIsSidebarOpen(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze/${activeTab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          coordinates: selection.coords,
          area_sq_km: selection.areaSqKm 
        }),
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      
      setResults(prev => ({ ...(prev || {}), ...data.visualizations }));
      setActiveAnalysisId(data.analysis_id); 
      fetchHistory(); 
      
    } catch (error) {
      console.error(error);
      alert("Error connecting to the backend. Ensure FastAPI is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportClick = async () => {
    if (!activeAnalysisId) return;
    if (aiReport) {
      setIsReportModalOpen(true);
      return;
    }
    if (!confirm("Would you like Gemini to analyze these visuals and generate a scientific report?")) return;
    
    setIsGeneratingReport(true);
    setIsReportModalOpen(true); 

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history/${activeAnalysisId}/report`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error("Failed to generate report");
      const data = await response.json();
      setAiReport(data.report);
      fetchHistory(); 
    } catch (error) {
      console.error(error);
      alert("Failed to generate AI report.");
      setIsReportModalOpen(false); 
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const downloadPDF = () => {
    const element = document.getElementById('ai-report-content');
    if (!element) return;
    const printWindow = window.open('', '', 'width=900,height=800');
    if (!printWindow) {
        alert("Please allow popups to download the PDF.");
        return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GeoAI Scientific Report</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-10 bg-white text-slate-800 font-sans">
          <div class="max-w-4xl mx-auto prose prose-slate">
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 750);
  };

  const handleReplayGif = () => {
    setIsReplayingGif(true);
    setTimeout(() => {
      setReplayTick(prev => prev + 1);
      setIsReplayingGif(false);
    }, 50);
  };

  const renderKeys = results 
    ? (activeTab === 'current' ? CHART_ORDER_CURRENT : CHART_ORDER_FORECAST).filter(k => results[k])
    : [];

  return (
    <main className="relative w-screen h-screen bg-slate-200 overflow-hidden font-sans">
      
      {/* 1. BACKGROUND MAP */}
      <div className="absolute inset-0 w-screen h-screen z-0">
        <MapWidget 
          onSelectionChange={handleSelectionChange} 
          selectionMode={selectionMode}
          historySelection={historySelection}
        />
      </div>

      {/* 2. DYNAMIC CENTER TOP TOOLBAR (Search, Map Tools, RAG) */}
      <div 
        className={`absolute top-6 left-0 right-0 z-20 pointer-events-none flex justify-center transition-all duration-300 ease-in-out
          ${isSidebarOpen ? 'md:ml-[450px] lg:ml-[500px]' : ''}
        `}
      >
        <div className="pointer-events-auto flex flex-col md:flex-row items-center gap-3">
          
          <SearchBar onSelect={handleDistrictSearch} />
          
          <div className="bg-white p-1.5 rounded-full shadow-xl border border-slate-200 flex items-center gap-1">
            <button
              onClick={() => { setSelectionMode('square'); handleSelectionChange(null); }} 
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
                selectionMode === 'square' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"></rect></svg>
              Square
            </button>
            <button
              onClick={() => { setSelectionMode('freeform'); handleSelectionChange(null); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
                selectionMode === 'freeform' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 16v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3"></path></svg>
              Free-form
            </button>
          </div>

          <button
            onClick={() => setIsRagPageOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white p-1.5 pr-5 rounded-full shadow-xl border border-purple-500 flex items-center gap-3 transition-all hover:scale-105"
          >
            <div className="bg-white text-purple-600 p-2 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            </div>
            <span className="font-bold text-sm tracking-wide">Copilot</span>
          </button>
        </div>
      </div>

      {/* 3. FULL PAGE RAG CHAT (GeoAI Copilot) */}
      {isRagPageOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-50 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-200">
          <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsRagPageOpen(false)} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  GeoAI Multimodal Copilot
                </h1>
                <p className="text-sm text-slate-500 font-medium">Ask questions across all analyzed districts in the database.</p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
            <div className="max-w-4xl mx-auto flex flex-col gap-6">
              
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                </div>
                <div className="bg-white p-5 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-800">
                  <p>Hello! I am your GeoAI Copilot. You can ask me questions about any pre-computed district, such as <strong>"Which district has the highest desertification?"</strong> or <strong>"What is causing severe risk in Badin District?"</strong></p>
                </div>
              </div>

              {ragMessages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-purple-100 text-purple-600'}`}>
                    {msg.role === 'user' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    )}
                  </div>
                  <div className={`p-5 rounded-2xl shadow-sm max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 rounded-tl-none text-slate-800 prose prose-slate prose-img:rounded-xl'}`}>
                    {msg.role === 'ai' && msg.text === "" && isRagLoading ? (
                      <div className="flex items-center gap-2 min-h-[24px]">
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="bg-white border-t border-slate-200 p-4">
            <form onSubmit={handleSendRagMessage} className="max-w-4xl mx-auto flex gap-4 relative">
              <input 
                type="text" 
                value={ragInput}
                onChange={(e) => setRagInput(e.target.value)}
                placeholder="Ask about drivers, forecasts, or compare districts..." 
                className="flex-1 bg-slate-100 border-none rounded-full py-4 pl-6 pr-16 text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                disabled={isRagLoading}
              />
              <button 
                type="submit" 
                disabled={isRagLoading || !ragInput.trim()}
                className="absolute right-2 top-2 bottom-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white w-12 rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. FULLSCREEN LIGHTBOX MODAL */}
      {fullScreenKey && results && results[fullScreenKey] && !isRagPageOpen && (
        <div className="fixed inset-0 z-[9999] bg-black bg-opacity-95 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-sm">
          <div className="absolute top-6 right-6 flex gap-4">
            {fullScreenKey.includes('gif') && (
              <button 
                onClick={handleReplayGif} 
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Replay GIF
              </button>
            )}
            <button 
              onClick={() => setFullScreenKey(null)} 
              className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Close
            </button>
          </div>
          
          {!isReplayingGif && (
            <img 
              key={`${fullScreenKey}-${replayTick}`} 
              src={getImageSrc(fullScreenKey, results[fullScreenKey])} 
              alt="Fullscreen Visualization" 
              className="max-w-full max-h-full object-contain rounded shadow-2xl"
            />
          )}
        </div>
      )}

      {/* 5. GEMINI REPORT MODAL WINDOW */}
      {isReportModalOpen && !isRagPageOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900 bg-opacity-80 flex justify-center items-start overflow-y-auto p-4 md:p-8 backdrop-blur-sm">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl relative my-auto overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 flex-shrink-0">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                AI Scientific Report
              </h2>
              <div className="flex items-center gap-3">
                {aiReport && !isGeneratingReport && (
                  <button 
                    onClick={downloadPDF}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download PDF
                  </button>
                )}
                <button 
                  onClick={() => setIsReportModalOpen(false)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-8 overflow-y-auto flex-1 bg-slate-50">
              {isGeneratingReport ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <svg className="animate-spin w-12 h-12 text-purple-600 mb-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <p className="text-xl font-bold text-slate-800 mb-2">Gemini is analyzing spatial data...</p>
                  <p className="text-slate-500 font-medium">Drafting environmental summary and actionable insights.</p>
                </div>
              ) : aiReport ? (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                  <div id="ai-report-content" className="prose prose-slate max-w-none prose-img:rounded-xl prose-img:shadow-md prose-headings:text-slate-800 prose-a:text-blue-600">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiReport}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 6. GROUPED FLOATING TOGGLE BUTTONS (Left Side, cleanly anchored relative to Sidebar) */}
      <div 
        className={`absolute top-6 z-20 flex items-center gap-3 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'left-[calc(100vw-4rem)] md:left-[470px] lg:left-[520px]' : 'left-6'
        }`}
      >
        {activeAnalysisId && activeAnalysisId.length > 24 && (
          <button 
            onClick={handleReportClick}
            title={aiReport ? "View Generated Report" : "Generate Gemini AI Report"}
            className={`p-3 rounded-full shadow-lg border flex items-center gap-2 font-bold transition-all duration-300 ease-in-out hover:scale-105 ${
              aiReport 
                ? 'bg-purple-100 text-purple-700 border-purple-300' 
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-transparent'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </button>
        )}

        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="bg-white text-slate-800 p-3 rounded-full shadow-xl border border-slate-200 flex items-center gap-2 font-bold transition-colors hover:bg-slate-50"
        >
          {isSidebarOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
          ) : (
            <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg> Analysis Panel</>
          )}
        </button>
      </div>

      {/* 7. HISTORY PANEL TOGGLE: Fixed safely at the bottom right */}
      <button 
        onClick={() => setIsHistoryOpen(true)}
        className={`absolute bottom-6 right-6 z-20 bg-white text-slate-800 p-4 rounded-full shadow-xl border border-slate-200 flex items-center justify-center font-bold transition-all duration-300 ease-in-out hover:bg-slate-50 hover:scale-105 ${
          isHistoryOpen ? 'opacity-0 pointer-events-none translate-y-10' : 'opacity-100 translate-y-0'
        }`}
        title="View History"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </button>

      {/* 8. FOREGROUND SIDEBAR (Analysis Panel) */}
      <div 
        className={`absolute top-0 left-0 h-full bg-white shadow-[10px_0_30px_rgba(0,0,0,0.15)] z-30 flex flex-col transition-transform duration-300 ease-in-out w-full md:w-[450px] lg:w-[500px] ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-shrink-0 flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-blue-600 text-white">
            <div className="flex items-center gap-3 mb-1">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h1 className="text-2xl font-bold tracking-tight">GeoAI Analytics</h1>
            </div>
            <p className="text-blue-100 text-sm font-medium">Desertification Risk Assessment Platform</p>
          </div>

          <div className="flex p-4 border-b border-slate-200 bg-slate-50 gap-2 shadow-sm z-10">
            <button 
              onClick={() => setActiveTab('current')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'current' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Baseline Analysis
            </button>
            <button 
              onClick={() => setActiveTab('forecast')}
              disabled={!forecastData && !selection}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'forecast' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              5-Year Forecast
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            {selection ? (
              <div className="mb-5 bg-blue-50 border border-blue-100 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-blue-800 uppercase tracking-wider">
                    {baselineData ? baselineData.district_name : 'Region of Interest'}
                  </span>
                  <div className="flex items-center gap-2">
                    {Array.isArray(selection.corners) && Array.isArray(selection.corners[0]) && (
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
                        {selection.corners.length} Parts
                      </span>
                    )}
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                      ~{selection.areaSqKm.toFixed(2)} km²
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
                  {getFlatCorners(selection.corners).slice(0, 4).map((c: any, i: number) => (
                    c?.lat !== undefined && c?.lng !== undefined && !isNaN(c.lat) && !isNaN(c.lng) ? (
                      <div key={i} className="bg-white p-1.5 rounded border border-slate-200 text-center shadow-sm">
                        {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-amber-600 mb-5 font-semibold bg-amber-50 py-3 rounded-lg border border-amber-200">
                Search a district or select a region to begin.
              </p>
            )}

            <button
              onClick={runAnalysis}
              disabled={!selection || isLoading}
              className={`w-full py-3 rounded-lg text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md
                ${!selection ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isLoading ? (
                <><svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Computing...</>
              ) : (
                <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Execute {activeTab === 'current' ? 'Model A' : 'Model B'}</>
              )}
            </button>
          </div>

          {!isLoading && renderKeys.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 opacity-70">
              <svg className="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              <p className="text-lg font-medium">Awaiting Telemetry</p>
            </div>
          )}

          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-blue-600">
              <svg className="animate-spin w-16 h-16 mb-6 opacity-80" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <p className="font-bold text-lg animate-pulse">Running Neural Network...</p>
              <p className="text-sm text-slate-500 mt-2 text-center max-w-xs">
                {activeTab === 'current' ? 'Processing 33-band composite stack.' : 'Unrolling ConvGRU sequence. This may take a few minutes.'}
              </p>
            </div>
          )}

          {results && renderKeys.length > 0 && (
            <div className="flex flex-col gap-6 pb-8">
              {renderKeys.map((key) => (
                <div 
                  key={key} 
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
                  onClick={() => { setFullScreenKey(key); setReplayTick(0); setIsReplayingGif(false); }}
                >
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">{formatTitle(key)}</h3>
                    <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                      Expand
                    </span>
                  </div>
                  <div className="p-2 relative bg-white flex justify-center">
                    {key.includes('gif') && (
                      <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white text-xs font-bold px-2 py-1 rounded z-10">GIF</div>
                    )}
                    <img 
                      src={getImageSrc(key, results[key])} 
                      alt={key} 
                      className="w-full h-auto object-contain rounded pointer-events-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 9. RIGHT SIDEBAR (History Panel) */}
      <div 
        className={`absolute top-0 right-0 h-full bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.15)] z-30 flex flex-col transition-transform duration-300 ease-in-out w-full md:w-[350px] lg:w-[400px] ${
          isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-800">History</h2>
          <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-70">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p className="text-sm font-medium">No previous analysis found</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => loadHistoryItem(item)}
                className={`bg-white p-4 rounded-xl shadow-sm border cursor-pointer transition-all relative group ${
                  activeAnalysisId === item.id ? 'border-purple-400 ring-2 ring-purple-100' : 'border-slate-200 hover:border-blue-400'
                }`}
              >
                <button 
                  onClick={(e) => deleteHistoryItem(e, item.id)}
                  className="absolute top-3 right-3 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete Analysis"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${item.analysis_type === 'current' ? 'bg-teal-500' : 'bg-orange-500'}`}></span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {item.analysis_type === 'current' ? 'Baseline Analysis' : '5-Year Forecast'}
                  </span>
                  {item.ai_report && (
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded ml-auto flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                      Report
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-slate-800">Area: {Number(item.area_sq_km).toFixed(2)} km²</p>
                <p className="text-[11px] text-slate-400 mt-2 font-mono">
                  {new Date(item.created_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      
    </main>
  );
}