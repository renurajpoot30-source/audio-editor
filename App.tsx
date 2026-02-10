
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Waveform, 
  Settings, 
  Mic, 
  Upload, 
  Play, 
  Pause, 
  Square, 
  Scissors, 
  Zap, 
  ChevronRight,
  Download,
  Trash2,
  Volume2,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { analyzeAudio, getAIAssistantAdvice } from './services/geminiService';
import { AppStatus, AudioMetadata, AIAnalysis, AudioFilterSettings } from './types';

// Components
const IconButton = ({ icon: Icon, onClick, active = false, disabled = false, label = "" }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' 
        : 'hover:bg-white/10 text-gray-400 hover:text-white'
    } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    title={label}
  >
    <Icon size={20} />
    {label && <span className="text-sm font-medium pr-1">{label}</span>}
  </button>
);

const SidebarItem = ({ icon: Icon, title, description, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`w-full text-left p-4 rounded-2xl mb-2 transition-all border ${
      active 
        ? 'bg-blue-600/10 border-blue-500/50 text-white' 
        : 'border-transparent hover:bg-white/5 text-gray-400'
    }`}
  >
    <div className="flex items-center gap-3 mb-1">
      <Icon size={18} className={active ? 'text-blue-400' : 'text-gray-500'} />
      <span className="font-semibold">{title}</span>
    </div>
    <p className="text-xs opacity-60 leading-relaxed">{description}</p>
  </button>
);

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoom, setZoom] = useState(10);
  const [filters, setFilters] = useState<AudioFilterSettings>({
    gain: 1,
    lowPass: 20000,
    highPass: 20,
    compression: 0
  });

  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Waveform Init
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4f46e5',
      progressColor: '#3b82f6',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 3,
      barRadius: 3,
      height: 140,
      minPxPerSec: zoom,
      plugins: [RegionsPlugin.create()]
    });

    ws.load(audioUrl);
    ws.on('ready', () => {
      setMetadata(prev => prev ? { ...prev, duration: ws.getDuration() } : null);
      setStatus(AppStatus.EDITING);
    });
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    wavesurferRef.current = ws;

    return () => ws.destroy();
  }, [audioUrl]);

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setMetadata({
        name: file.name,
        size: file.size,
        format: file.type,
        duration: 0,
        lastModified: file.lastModified
      });
      setStatus(AppStatus.LOADING);
      setAnalysis(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setMetadata({
          name: `Recording_${new Date().toLocaleTimeString()}.wav`,
          size: blob.size,
          format: 'audio/wav',
          duration: 0,
          lastModified: Date.now()
        });
        setIsRecording(false);
        setStatus(AppStatus.EDITING);
      };

      recorder.start();
      setIsRecording(true);
      setStatus(AppStatus.RECORDING);
    } catch (err) {
      console.error("Recording failed", err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
  };

  const handleAiAnalysis = async () => {
    if (!audioUrl || !metadata) return;
    setStatus(AppStatus.ANALYZING);
    
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await analyzeAudio(base64, metadata.format || 'audio/wav');
        setAnalysis(result);
        setStatus(AppStatus.EDITING);

        // Add to chat history
        setChatHistory(prev => [
          ...prev, 
          { role: 'assistant', text: `Analysis complete for "${metadata.name}". I've detected a noise level of ${result.noiseLevel} and an overall quality score of ${result.audioQualityScore}/100.` }
        ]);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("AI Analysis failed", err);
      setStatus(AppStatus.EDITING);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiThinking(true);

    try {
      const advice = await getAIAssistantAdvice(chatHistory, userMsg);
      setChatHistory(prev => [...prev, { role: 'assistant', text: advice || 'I am having trouble processing that.' }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', text: 'Error contacting AI engine.' }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0c] text-gray-200 overflow-hidden">
      {/* Header */}
      <header className="h-16 glass px-6 flex items-center justify-between border-b border-white/5 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-xl">
            <Sparkles className="text-white" size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white leading-none">SonicFlow <span className="text-blue-500">AI</span></h1>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-[0.2em]">Next-Gen Audio Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {audioUrl && (
            <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-xl mr-4 border border-white/5">
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-white truncate max-w-[150px]">{metadata?.name}</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{formatFileSize(metadata?.size || 0)} • {metadata?.format}</span>
              </div>
              <button 
                onClick={() => { setAudioUrl(null); setAnalysis(null); }}
                className="text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          
          <IconButton icon={Download} label="Export" disabled={!audioUrl} />
          <div className="h-6 w-[1px] bg-white/10 mx-2" />
          <IconButton icon={Settings} label="Settings" />
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <aside className="w-80 glass border-r border-white/5 p-4 flex flex-col overflow-y-auto hidden md:flex">
          <div className="mb-8">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Operations</h3>
            <SidebarItem 
              icon={Upload} 
              title="Import Track" 
              description="Upload WAV, MP3, or OGG files to begin editing." 
              onClick={() => fileInputRef.current?.click()}
            />
            <SidebarItem 
              icon={Mic} 
              title="New Recording" 
              description="Capture high-fidelity audio directly from your device." 
              active={isRecording}
              onClick={isRecording ? stopRecording : startRecording}
            />
            <SidebarItem 
              icon={Sparkles} 
              title="AI Analysis" 
              description="Get professional feedback and enhancement suggestions." 
              active={status === AppStatus.ANALYZING}
              onClick={handleAiAnalysis}
            />
          </div>

          <div className="flex-1">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Mastering Rack</h3>
            <div className="space-y-6 px-2">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-400">Gain Control</span>
                  <span className="mono text-[10px] text-blue-400">{filters.gain.toFixed(1)}dB</span>
                </div>
                <input 
                  type="range" min="0" max="2" step="0.1" value={filters.gain} 
                  onChange={(e) => setFilters({...filters, gain: parseFloat(e.target.value)})}
                  className="w-full accent-blue-600 h-1 rounded-full bg-white/10 appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-400">Low Pass</span>
                  <span className="mono text-[10px] text-blue-400">{filters.lowPass}Hz</span>
                </div>
                <input 
                  type="range" min="1000" max="20000" step="100" value={filters.lowPass} 
                  onChange={(e) => setFilters({...filters, lowPass: parseInt(e.target.value)})}
                  className="w-full accent-blue-600 h-1 rounded-full bg-white/10 appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-400">High Pass</span>
                  <span className="mono text-[10px] text-blue-400">{filters.highPass}Hz</span>
                </div>
                <input 
                  type="range" min="20" max="500" step="10" value={filters.highPass} 
                  onChange={(e) => setFilters({...filters, highPass: parseInt(e.target.value)})}
                  className="w-full accent-blue-600 h-1 rounded-full bg-white/10 appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2 text-blue-400">
              <Zap size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Active Engine</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Gemini 3 Flash Pro is currently powering your audio analysis and mastering suggestions.
            </p>
          </div>
        </aside>

        {/* Editor Area */}
        <section className="flex-1 flex flex-col relative">
          {!audioUrl ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-md w-full glass p-10 rounded-3xl border-2 border-dashed border-white/10 text-center hover:border-blue-500/30 transition-all group">
                <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <Upload className="text-blue-500" size={32} />
                </div>
                <h2 className="text-2xl font-bold mb-3 text-white">Drop your masterpiece</h2>
                <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                  Start your creative flow. Upload a file or record live to use our AI-powered audio suite.
                </p>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-blue-500 hover:text-white transition-all shadow-xl shadow-white/5"
                  >
                    Select Local File
                  </button>
                  <button 
                    onClick={startRecording}
                    className="w-full py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-all border border-white/10"
                  >
                    Start Quick Record
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Waveform Visualization */}
              <div className="flex-1 p-8 flex flex-col">
                <div className="flex-1 relative waveform-container rounded-3xl border border-white/5 p-8 flex flex-col justify-center shadow-2xl overflow-hidden">
                  <div className="absolute top-6 left-8 flex items-center gap-4 z-10">
                    <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                      <span className="mono text-xs font-medium text-white">
                        {wavesurferRef.current?.getCurrentTime().toFixed(2)}s / {metadata?.duration.toFixed(2)}s
                      </span>
                    </div>
                  </div>

                  <div ref={containerRef} className="w-full" />
                  
                  <div className="mt-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => wavesurferRef.current?.playPause()}
                        className="w-16 h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-blue-900/40 transition-all hover:scale-105"
                      >
                        {isPlaying ? <Pause size={32} /> : <Play size={32} fill="currentColor" className="ml-1" />}
                      </button>
                      <IconButton icon={Square} label="Stop" onClick={() => wavesurferRef.current?.stop()} />
                      <div className="h-8 w-[1px] bg-white/10 mx-2" />
                      <IconButton icon={Scissors} label="Trim" />
                    </div>

                    <div className="flex items-center gap-6 glass px-6 py-3 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <Volume2 size={16} className="text-gray-500" />
                        <input type="range" className="w-24 accent-blue-500 h-1" />
                      </div>
                      <div className="h-6 w-[1px] bg-white/10" />
                      <div className="flex items-center gap-4">
                        <Waveform size={16} className="text-gray-500" />
                        <input 
                          type="range" min="1" max="100" value={zoom} 
                          onChange={(e) => setZoom(parseInt(e.target.value))}
                          className="w-24 accent-blue-500 h-1" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis/Results Grid */}
                {analysis && (
                  <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom duration-500">
                    <div className="glass p-6 rounded-3xl border border-white/10">
                      <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <MessageSquare size={14} /> Transcription
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed italic h-[120px] overflow-y-auto">
                        "{analysis.transcript || 'No speech detected in this segment.'}"
                      </p>
                    </div>

                    <div className="glass p-6 rounded-3xl border border-white/10">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap size={14} /> AI Mastering Tips
                      </h4>
                      <ul className="space-y-3 h-[120px] overflow-y-auto">
                        {analysis.enhancementSuggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-3 group">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="text-xs text-gray-400 group-hover:text-white transition-colors">{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="glass p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
                      <div>
                        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Waveform size={14} /> Technical Health
                        </h4>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">Quality Score</span>
                          <span className="text-sm font-bold text-white">{analysis.audioQualityScore}%</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-6">
                          <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${analysis.audioQualityScore}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                        <div className={`p-2 rounded-lg ${analysis.noiseLevel === 'Low' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          <Volume2 size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Background Noise</p>
                          <p className="text-xs font-semibold text-white">{analysis.noiseLevel} Density</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* AI Helper Overlay */}
          <div className="absolute top-8 right-8 w-80 h-[500px] flex flex-col hidden lg:flex">
             <div className="glass h-full rounded-3xl border border-white/10 flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <MessageSquare size={14} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-widest">Engineering AI</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-8 px-4">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        "I'm your virtual audio engineer. Ask me how to fix clipping, EQ vocals, or optimize your master for Spotify."
                      </p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : 'bg-white/5 text-gray-300 border border-white/5 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5 flex gap-1">
                        <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" />
                        <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white/5 border-t border-white/5">
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Ask the engineer..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2.5 px-4 pr-10 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button 
                      onClick={sendChatMessage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-white transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
             </div>
          </div>
        </section>
      </main>

      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="audio/*" 
        className="hidden" 
      />

      {/* Footer Info */}
      <footer className="h-8 glass px-6 flex items-center justify-between border-t border-white/5 z-20 text-[10px] text-gray-500">
        <div className="flex gap-4">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Workspace Ready</span>
          <span>Sample Rate: 44.1kHz</span>
          <span>Buffer: 1024ms</span>
        </div>
        <div className="mono">
          Powered by Google Gemini 3 Flash
        </div>
      </footer>

      {/* Global Processing Overlay */}
      {status === AppStatus.ANALYZING && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-4 bg-blue-600/20 rounded-full flex items-center justify-center">
              <Sparkles className="text-blue-500 animate-pulse" size={24} />
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Analyzing Sonic Content</h2>
          <p className="text-gray-400 text-sm max-w-xs text-center leading-relaxed">
            Our AI is currently listening to your track to identify peaks, noise floor, and spectral balance...
          </p>
        </div>
      )}
    </div>
  );
};

export default App;
