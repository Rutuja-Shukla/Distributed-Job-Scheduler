import React, { useState } from 'react';
import { 
  Server, Cpu, Database, Activity, Terminal, FileCode, 
  ShieldAlert, BookOpen, Layers, CheckCircle2, Zap, ArrowRight, Github,
  Sun, Moon
} from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { InteractiveSimulator } from './components/InteractiveSimulator';
import { ArchitectureView } from './components/ArchitectureView';
import { ExplainView } from './components/ExplainView';
import { JitterCalculator } from './components/JitterCalculator';
import { ApiConsole } from './components/ApiConsole';
import { CodeExplorer } from './components/CodeExplorer';
import { MilestonesView } from './components/MilestonesView';

type Tab = 'simulator' | 'architecture' | 'explain' | 'jitter' | 'api' | 'codebase' | 'milestones';

function MainApp() {
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('simulator');

  const navItems: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'simulator', label: 'Live Simulator & Chaos', icon: Zap },
    { id: 'architecture', label: 'Architecture & Invariants', icon: Layers },
    { id: 'explain', label: 'EXPLAIN Index Analysis', icon: Database },
    { id: 'jitter', label: 'Full Jitter & Retries', icon: Activity },
    { id: 'api', label: 'API & Metrics Console', icon: Terminal },
    { id: 'codebase', label: 'Go Codebase Explorer', icon: FileCode },
    { id: 'milestones', label: 'Milestones Ledger', icon: BookOpen },
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 flex flex-col ${
      isDark 
        ? 'bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200' 
        : 'bg-[#f8fafc] text-slate-900 selection:bg-indigo-500/20 selection:text-indigo-900'
    }`}>
      {/* Top Header */}
      <header className={`border-b sticky top-0 z-50 backdrop-blur transition-colors ${
        isDark 
          ? 'border-slate-800 bg-slate-900/90' 
          : 'border-slate-200/90 bg-white/95 shadow-xs'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition ${
              isDark 
                ? 'bg-gradient-to-tr from-cyan-600 to-indigo-600 shadow-cyan-500/20' 
                : 'bg-gradient-to-tr from-indigo-600 to-blue-600 shadow-indigo-500/20'
            }`}>
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Distributed Job Scheduler
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isDark 
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                  Go 1.22+ & PostgreSQL
                </span>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                SKIP LOCKED Leases &bull; Advisory Lock Leader &bull; Full Jitter Retries &bull; DLQ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status indicator */}
            <div className={`hidden md:flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-mono transition ${
              isDark 
                ? 'bg-slate-900 border-slate-800 text-slate-400' 
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>PostgreSQL 16 Engine Active</span>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                isDark 
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300' 
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-700 shadow-xs'
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
              <span className="hidden sm:inline">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {/* Inspect Code Button */}
            <button
              onClick={() => setActiveTab('codebase')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                isDark 
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent shadow-sm shadow-indigo-500/20'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Inspect Code</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-1 border-t no-scrollbar ${
          isDark ? 'border-slate-800/80' : 'border-slate-200/80'
        }`}>
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition ${
                  isActive
                    ? isDark 
                      ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20' 
                      : 'border-indigo-600 text-indigo-700 bg-indigo-50/70 font-semibold'
                    : isDark
                      ? 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <item.icon className={`w-3.5 h-3.5 ${
                  isActive 
                    ? (isDark ? 'text-cyan-400' : 'text-indigo-600') 
                    : (isDark ? 'text-slate-400' : 'text-slate-500')
                }`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'simulator' && <InteractiveSimulator />}
        {activeTab === 'architecture' && <ArchitectureView />}
        {activeTab === 'explain' && <ExplainView />}
        {activeTab === 'jitter' && <JitterCalculator />}
        {activeTab === 'api' && <ApiConsole />}
        {activeTab === 'codebase' && <CodeExplorer />}
        {activeTab === 'milestones' && <MilestonesView />}
      </main>

      {/* Footer */}
      <footer className={`border-t py-6 text-center text-xs transition ${
        isDark 
          ? 'border-slate-800/80 bg-slate-950 text-slate-500' 
          : 'border-slate-200 bg-white text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Distributed Job Scheduler in Go</span>
            <span className="mx-2">&bull;</span>
            <span>At-least-once delivery with PostgreSQL row-level locks and visibility leases.</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-emerald-600 font-semibold">Race Detector: Clean</span>
            <span>&bull;</span>
            <span>Fuzz Tested</span>
            <span>&bull;</span>
            <span>Zero Library Fallbacks</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
