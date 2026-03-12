/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Download, BookOpen, Settings, AlertCircle, Loader2, Save, Trash2, Plus, Languages, FileText, FolderUp } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  indexUrl: string;
  linkSelector: string;
  contentSelector: string;
  limit: string;
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [mode, setMode] = useState<'download' | 'translate' | 'local'>('download');
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  
  const [profileName, setProfileName] = useState('My Novel');
  const [indexUrl, setIndexUrl] = useState('https://www.22biqu.com/biqu41440/');
  const [linkSelector, setLinkSelector] = useState('.section-list:eq(1) a');
  const [contentSelector, setContentSelector] = useState('#content');
  const [limit, setLimit] = useState('50');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load profiles on mount
  useEffect(() => {
    const saved = localStorage.getItem('novel_profiles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length > 0) {
          loadProfile(parsed[0]);
        }
      } catch (e) {
        console.error('Failed to parse profiles');
      }
    }
  }, []);

  // Save profiles when they change
  useEffect(() => {
    if (profiles.length > 0) {
      localStorage.setItem('novel_profiles', JSON.stringify(profiles));
    } else {
      localStorage.removeItem('novel_profiles');
    }
  }, [profiles]);

  const loadProfile = (p: Profile) => {
    setActiveProfileId(p.id);
    setProfileName(p.name);
    setIndexUrl(p.indexUrl);
    setLinkSelector(p.linkSelector);
    setContentSelector(p.contentSelector);
    setLimit(p.limit);
    setError('');
  };

  const saveCurrentProfile = () => {
    const newProfile: Profile = {
      id: activeProfileId || Date.now().toString(),
      name: profileName || 'Untitled Profile',
      indexUrl,
      linkSelector,
      contentSelector,
      limit
    };

    setProfiles(prev => {
      const exists = prev.findIndex(p => p.id === newProfile.id);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = newProfile;
        return updated;
      }
      return [...prev, newProfile];
    });
    setActiveProfileId(newProfile.id);
  };

  const createNewProfile = () => {
    setActiveProfileId('');
    setProfileName('New Novel');
    setIndexUrl('');
    setLinkSelector('.section-list:eq(1) a');
    setContentSelector('#content');
    setLimit('50');
    setError('');
  };

  const deleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) {
      createNewProfile();
    }
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'local') {
      if (localFiles.length === 0) {
        setError('Please select a directory containing text files.');
        return;
      }
      setLoading(true);
      setError('');

      try {
        const fileData = await Promise.all(localFiles.map(async (f) => {
          const text = await f.text();
          return { name: f.name, content: text };
        }));

        const response = await fetch('/api/translate-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: fileData }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${response.status}`);
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `translated_local_novel.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!indexUrl || !linkSelector || !contentSelector) {
      setError('Please fill in all required fields.');
      return;
    }

    // Auto-save on download
    saveCurrentProfile();

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indexUrl,
          linkSelector,
          contentSelector,
          limit,
          translate: mode === 'translate'
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      // Handle file download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${profileName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'novel'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30 flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800/50 bg-zinc-950/50 p-4 flex flex-col h-screen sticky top-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h2 className="font-medium tracking-tight">Saved Novels</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2">
          {profiles.map(p => (
            <div
              key={p.id}
              onClick={() => loadProfile(p)}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                activeProfileId === p.id 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span className="truncate text-sm font-medium">{p.name}</span>
              <button 
                onClick={(e) => deleteProfile(p.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded-md transition-all text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {profiles.length === 0 && (
            <p className="text-xs text-zinc-600 px-2 text-center mt-4">No saved profiles yet.</p>
          )}
        </div>

        <button
          onClick={createNewProfile}
          className="mt-4 flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-sm font-medium transition-all text-zinc-300"
        >
          <Plus className="w-4 h-4" />
          New Profile
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-12">
          <header className="mb-10">
            <h1 className="text-3xl font-medium tracking-tight mb-2">Configure Downloader</h1>
            <p className="text-zinc-400">
              Extract chapters from any web novel and download them as a ZIP of text files.
            </p>
          </header>

          {/* Mode Toolbar */}
          <div className="flex p-1 bg-zinc-900/80 border border-zinc-800/80 rounded-xl mb-8 w-fit">
            <button
              type="button"
              onClick={() => setMode('download')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'download' 
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Download Original
            </button>
            <button
              type="button"
              onClick={() => setMode('translate')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'translate' 
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Languages className="w-4 h-4" />
              Translate to English
            </button>
            <button
              type="button"
              onClick={() => setMode('local')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'local' 
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FolderUp className="w-4 h-4" />
              Translate Local Files
            </button>
          </div>

          <form onSubmit={handleDownload} className="space-y-8">
            {mode === 'local' ? (
              <div className="space-y-6 bg-zinc-900/50 border border-zinc-800/50 rounded-3xl p-8">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Select Novel Directory
                  </label>
                  <input
                    type="file"
                    // @ts-expect-error webkitdirectory is non-standard but supported
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        const files = Array.from(e.target.files).filter(f => f.name.endsWith('.txt'));
                        setLocalFiles(files);
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    {localFiles.length > 0 
                      ? `${localFiles.length} text files selected.` 
                      : 'Select a folder containing .txt files to translate them.'}
                  </p>
                </div>
              </div>
            ) : (
            <div className="space-y-6 bg-zinc-900/50 border border-zinc-800/50 rounded-3xl p-8">
              
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="profileName" className="block text-sm font-medium text-zinc-300">
                  Novel Name
                </label>
                <button 
                  type="button" 
                  onClick={saveCurrentProfile}
                  className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2 py-1 rounded-md"
                >
                  <Save className="w-3 h-3" /> Save Profile
                </button>
              </div>
              <input
                id="profileName"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="My Awesome Novel"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all mb-6"
                required
              />

              {/* Main Input */}
              <div>
                <label htmlFor="indexUrl" className="block text-sm font-medium text-zinc-300 mb-2">
                  Novel Index URL
                </label>
                <input
                  id="indexUrl"
                  type="url"
                  value={indexUrl}
                  onChange={(e) => setIndexUrl(e.target.value)}
                  placeholder="https://example.com/novel/index"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  required
                />
              </div>

              <div className="pt-6 border-t border-zinc-800/50">
                <div className="flex items-center gap-2 mb-4 text-zinc-400">
                  <Settings className="w-4 h-4" />
                  <h2 className="text-sm font-medium uppercase tracking-wider">Extraction Settings</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="linkSelector" className="block text-sm font-medium text-zinc-300 mb-2">
                      Chapter Link Selector
                    </label>
                    <input
                      id="linkSelector"
                      type="text"
                      value={linkSelector}
                      onChange={(e) => setLinkSelector(e.target.value)}
                      placeholder=".section-list:eq(1) a"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono text-sm"
                      required
                    />
                    <p className="mt-2 text-xs text-zinc-500">CSS selector for the chapter links on the index page.</p>
                  </div>

                  <div>
                    <label htmlFor="contentSelector" className="block text-sm font-medium text-zinc-300 mb-2">
                      Chapter Content Selector
                    </label>
                    <input
                      id="contentSelector"
                      type="text"
                      value={contentSelector}
                      onChange={(e) => setContentSelector(e.target.value)}
                      placeholder="#content"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono text-sm"
                      required
                    />
                    <p className="mt-2 text-xs text-zinc-500">CSS selector for the text content on each chapter page.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="limit" className="block text-sm font-medium text-zinc-300 mb-2">
                      Max Chapters Limit
                    </label>
                    <input
                      id="limit"
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="50"
                      min="1"
                      className="w-full md:w-1/2 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono text-sm"
                    />
                    <p className="mt-2 text-xs text-zinc-500">Limit the number of chapters downloaded to prevent timeouts.</p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium py-4 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{mode === 'translate' || mode === 'local' ? 'Translating & Zipping...' : 'Extracting & Zipping...'}</span>
                </>
              ) : (
                <>
                  {mode === 'translate' || mode === 'local' ? <Languages className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  <span>{mode === 'translate' || mode === 'local' ? 'Translate & Download Novel' : 'Download Novel'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
