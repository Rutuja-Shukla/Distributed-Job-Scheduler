import React, { useState } from 'react';
import JSZip from 'jszip';
import { 
  Folder, FileCode, Download, Copy, Check, Terminal, 
  Database, Layers, ShieldCheck, ChevronRight, CheckCircle2 
} from 'lucide-react';
import { CODEBASE_FILES, CodeFile } from '../data/codebase';
import { useTheme } from '../context/ThemeContext';

export const CodeExplorer: React.FC = () => {
  const { isDark } = useTheme();
  const [selectedFilePath, setSelectedFilePath] = useState<string>('internal/store/postgres.go');
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const selectedFile = CODEBASE_FILES.find(f => f.path === selectedFilePath) || CODEBASE_FILES[0];

  const cardClass = isDark 
    ? 'bg-slate-900 border-slate-800' 
    : 'bg-white border-slate-200 shadow-xs';
  const headingText = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      CODEBASE_FILES.forEach(file => {
        zip.file(file.path, file.content);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'distributed-job-scheduler-go.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create zip', err);
    } finally {
      setIsZipping(false);
    }
  };

  const categories = [
    { id: 'store', name: 'PostgreSQL Store', icon: Database },
    { id: 'worker', name: 'Worker & Protocol', icon: Layers },
    { id: 'scheduler', name: 'Cron & Advisory Leader', icon: Terminal },
    { id: 'api', name: 'REST Admin API', icon: FileCode },
    { id: 'proto', name: 'gRPC Protobuf', icon: FileCode },
    { id: 'migrations', name: 'SQL Migrations', icon: Database },
    { id: 'tests', name: 'Chaos, Race & Fuzz Tests', icon: ShieldCheck },
    { id: 'infra', name: 'Infra & Benchmarks', icon: Terminal },
    { id: 'docs', name: 'Documentation', icon: FileCode }
  ];

  return (
    <div className="space-y-6">
      {/* Banner with Download Button */}
      <div className={`border rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 border-slate-800' 
          : 'bg-gradient-to-r from-white via-indigo-50/50 to-white border-slate-200 shadow-xs'
      }`}>
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
            <FileCode className="w-4 h-4" />
            Complete Go 1.22+ Repository
          </div>
          <h2 className={`text-xl font-bold ${headingText}`}>
            Distributed Job Scheduler Codebase
          </h2>
          <p className={`text-sm mt-1 max-w-2xl ${mutedText}`}>
            Idiomatic Go, zero external queue libraries, test-driven with Testcontainers, race-detector clean, and production-ready.
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className={`font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-sm self-start md:self-auto disabled:opacity-50 ${
            isDark 
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
          }`}
        >
          <Download className="w-4 h-4" />
          {isZipping ? 'Bundling Zip...' : 'Download Full Repo (.zip)'}
        </button>
      </div>

      {/* Explorer Container */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 border rounded-xl overflow-hidden min-h-[600px] transition ${cardClass}`}>
        {/* Left Side: File Tree */}
        <div className={`lg:col-span-4 border-r p-4 space-y-4 transition ${
          isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/70'
        }`}>
          <div className="text-xs font-semibold uppercase tracking-wider px-2 text-slate-500">
            Project Files
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[650px] pr-1">
            {categories.map(cat => {
              const catFiles = CODEBASE_FILES.filter(f => f.category === cat.id);
              if (catFiles.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-1">
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 ${headingText}`}>
                    <cat.icon className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                    <span>{cat.name}</span>
                  </div>

                  <div className="space-y-0.5 pl-2">
                    {catFiles.map(file => {
                      const isSelected = file.path === selectedFilePath;
                      return (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFilePath(file.path)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center justify-between border ${
                            isSelected
                              ? isDark 
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold' 
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200 font-bold shadow-xs'
                              : isDark
                                ? 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                        >
                          <span className="truncate">{file.path}</span>
                          {isSelected && <ChevronRight className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Code Viewer */}
        <div className="lg:col-span-8 flex flex-col bg-slate-900 text-slate-100">
          {/* File Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div>
              <div className="font-mono text-xs font-bold text-slate-100 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                {selectedFile.path}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {selectedFile.description}
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy File'}
            </button>
          </div>

          {/* Code Content */}
          <div className="flex-1 p-4 font-mono text-xs overflow-x-auto overflow-y-auto max-h-[620px] shadow-inner">
            <pre className="text-slate-200 leading-relaxed whitespace-pre">
              {selectedFile.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
