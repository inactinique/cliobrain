import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Bot, Search, BookOpen, Camera, FolderOpen, Globe, Vault } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Section = 'llm' | 'rag' | 'obsidian' | 'zotero' | 'tropy' | 'folders' | 'language';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState<Section>('llm');
  const [config, setConfig] = useState<any>(null);
  const [ollamaStatus, setOllamaStatus] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
    checkOllama();
  }, [isOpen]);

  const loadConfig = async () => {
    const result = await window.electron.config.getAll();
    if (result.success) setConfig(result.data);
  };

  const checkOllama = async () => {
    const result = await window.electron.ollama.checkAvailability();
    setOllamaStatus(result.success ? result.data : false);
    if (result.data) {
      const models = await window.electron.ollama.listModels();
      if (models.success) setOllamaModels(models.data || []);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    await window.electron.config.set(key, value);
    setConfig((prev: any) => {
      const updated = { ...prev };
      const keys = key.split('.');
      let obj = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  if (!isOpen || !config) return null;

  const sections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: 'llm', label: t('settings.llm'), icon: <Bot size={16} /> },
    { id: 'rag', label: t('settings.rag'), icon: <Search size={16} /> },
    { id: 'obsidian', label: 'Obsidian', icon: <Vault size={16} /> },
    { id: 'zotero', label: t('settings.zotero'), icon: <BookOpen size={16} /> },
    { id: 'tropy', label: t('settings.tropy'), icon: <Camera size={16} /> },
    { id: 'folders', label: t('settings.folders'), icon: <FolderOpen size={16} /> },
    { id: 'language', label: t('settings.language'), icon: <Globe size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-48 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-4">
          <h2 className="px-4 text-sm font-semibold mb-3">{t('settings.title')}</h2>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
                activeSection === s.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold">
              {sections.find(s => s.id === activeSection)?.label}
            </h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {activeSection === 'llm' && (
              <LLMSection config={config} onUpdate={updateConfig} ollamaStatus={ollamaStatus} models={ollamaModels} />
            )}
            {activeSection === 'rag' && (
              <RAGSection config={config} onUpdate={updateConfig} />
            )}
            {activeSection === 'obsidian' && (
              <ObsidianSection config={config} onUpdate={updateConfig} />
            )}
            {activeSection === 'zotero' && (
              <ZoteroSection config={config} onUpdate={updateConfig} />
            )}
            {activeSection === 'tropy' && (
              <TropySection config={config} onUpdate={updateConfig} />
            )}
            {activeSection === 'folders' && (
              <FoldersSection config={config} />
            )}
            {activeSection === 'language' && (
              <LanguageSection config={config} onUpdate={updateConfig} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section Components ─────────────────────────────────────────

function LLMSection({ config, onUpdate, ollamaStatus, models }: any) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${ollamaStatus ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-gray-500">
          Ollama: {ollamaStatus ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <Field label="Ollama URL" value={config.llm?.ollamaURL || ''} onChange={v => onUpdate('llm.ollamaURL', v)} />
      <SelectField
        label="Chat Model"
        value={config.llm?.ollamaChatModel || ''}
        options={models.length > 0 ? models : ['gemma2:2b', 'llama3.2:3b', 'mistral:7b', 'qwen2.5:7b']}
        onChange={v => onUpdate('llm.ollamaChatModel', v)}
      />
      <SelectField
        label="Embedding Model"
        value={config.llm?.ollamaEmbeddingModel || ''}
        options={models.length > 0 ? models.filter((m: string) => m.includes('embed') || m.includes('nomic')) : ['nomic-embed-text', 'mxbai-embed-large']}
        onChange={v => onUpdate('llm.ollamaEmbeddingModel', v)}
      />
    </>
  );
}

function RAGSection({ config, onUpdate }: any) {
  return (
    <>
      <NumberField label="Top K (résultats)" value={config.rag?.topK || 10} onChange={v => onUpdate('rag.topK', v)} min={1} max={50} />
      <NumberField label="Similarity Threshold" value={config.rag?.similarityThreshold || 0.12} onChange={v => onUpdate('rag.similarityThreshold', v)} min={0} max={1} step={0.01} />
      <Toggle label="Recherche hybride (dense + sparse)" value={config.rag?.useHybridSearch !== false} onChange={v => onUpdate('rag.useHybridSearch', v)} />
      <Toggle label="Compression du contexte" value={config.rag?.enableContextCompression !== false} onChange={v => onUpdate('rag.enableContextCompression', v)} />
      <Toggle label="Mode agent (ReAct)" value={config.rag?.enableAgent || false} onChange={v => onUpdate('rag.enableAgent', v)} />
      <NumberField label="Max iterations agent" value={config.rag?.maxAgentIterations || 5} onChange={v => onUpdate('rag.maxAgentIterations', v)} min={1} max={10} />
    </>
  );
}

function ObsidianSection({ config, onUpdate }: any) {
  const handleSelectVault = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      onUpdate('obsidian.vaultPath', result.data);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Field label="Vault Path" value={config.obsidian?.vaultPath || ''} onChange={v => onUpdate('obsidian.vaultPath', v)} />
        <button onClick={handleSelectVault} className="mt-5 px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 shrink-0">
          Parcourir
        </button>
      </div>
      <Field label="Export subfolder" value={config.obsidian?.exportSubfolder || 'cliobrain-exports'} onChange={v => onUpdate('obsidian.exportSubfolder', v)} />
      <Toggle label="Auto-index on file change" value={config.obsidian?.autoIndex !== false} onChange={v => onUpdate('obsidian.autoIndex', v)} />
      <Toggle label="Index on workspace startup" value={config.obsidian?.indexOnStartup || false} onChange={v => onUpdate('obsidian.indexOnStartup', v)} />
    </>
  );
}

function ZoteroSection({ config, onUpdate }: any) {
  const handleSelectDir = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      onUpdate('zotero.dataDirectory', result.data);
    }
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Connectez-vous à votre bibliothèque Zotero locale (accès lecture seule à la base SQLite).
      </p>
      <div className="flex items-center gap-2">
        <Field label="Zotero Data Directory" value={config.zotero?.dataDirectory || ''} onChange={v => onUpdate('zotero.dataDirectory', v)} placeholder="~/Zotero" />
        <button onClick={handleSelectDir} className="mt-5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 shrink-0">
          Parcourir
        </button>
      </div>
    </>
  );
}

function TropySection({ config, onUpdate }: any) {
  const handleSelectProject = async () => {
    const result = await window.electron.dialog.openFile({
      filters: [{ name: 'Tropy', extensions: ['tpy'] }],
    });
    if (result.success && result.data?.[0]) {
      onUpdate('tropy.projectPath', result.data[0]);
    }
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Connectez un projet Tropy pour indexer vos sources primaires.
      </p>
      <div className="flex items-center gap-2">
        <Field label="Tropy Project (.tpy)" value={config.tropy?.projectPath || ''} onChange={v => onUpdate('tropy.projectPath', v)} />
        <button onClick={handleSelectProject} className="mt-5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 shrink-0">
          Parcourir
        </button>
      </div>
      <Toggle label="OCR sur les photos" value={config.tropy?.performOCR || false} onChange={v => onUpdate('tropy.performOCR', v)} />
      <SelectField label="Langue OCR" value={config.tropy?.ocrLanguage || 'fra'} options={['fra', 'eng', 'deu']} onChange={v => onUpdate('tropy.ocrLanguage', v)} />
    </>
  );
}

function FoldersSection({ config }: any) {
  const [watched, setWatched] = useState<string[]>([]);

  useEffect(() => {
    window.electron.folder.listWatched().then(r => {
      if (r.success) setWatched(r.data || []);
    });
  }, []);

  const handleAdd = async () => {
    const result = await window.electron.dialog.openDirectory();
    if (result.success && result.data) {
      await window.electron.folder.addWatch(result.data);
      setWatched(prev => [...prev, result.data]);
    }
  };

  const handleRemove = async (path: string) => {
    await window.electron.folder.removeWatch(path);
    setWatched(prev => prev.filter(p => p !== path));
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Les dossiers surveillés sont automatiquement indexés quand des fichiers sont ajoutés ou modifiés.
      </p>
      {watched.map(p => (
        <div key={p} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded px-3 py-2 text-xs">
          <span className="truncate">{p}</span>
          <button onClick={() => handleRemove(p)} className="text-red-500 hover:text-red-700 ml-2 shrink-0">✕</button>
        </div>
      ))}
      <button onClick={handleAdd} className="w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded text-xs text-gray-500 hover:border-blue-500 hover:text-blue-500">
        + Ajouter un dossier
      </button>
    </>
  );
}

function LanguageSection({ config, onUpdate }: any) {
  const { i18n } = useTranslation();
  const languages = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
  ];

  const handleChange = (lang: string) => {
    onUpdate('language', lang);
    onUpdate('rag.systemPromptLanguage', lang);
    i18n.changeLanguage(lang);
    window.electron.ipcRenderer.send('language-changed', lang);
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Langue de l'interface et des prompts système.
      </p>
      {languages.map(lang => (
        <label key={lang.code} className="flex items-center gap-3 py-2 cursor-pointer">
          <input
            type="radio"
            name="language"
            checked={config.language === lang.code}
            onChange={() => handleChange(lang.code)}
            className="accent-blue-600"
          />
          <span className="text-sm">{lang.label}</span>
        </label>
      ))}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <SelectField
          label="Thème"
          value={config.theme || 'system'}
          options={['system', 'light', 'dark']}
          onChange={v => onUpdate('theme', v)}
        />
      </div>
    </>
  );
}

// ── Form primitives ─────────────────────────────────────────────

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex-1">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-32 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-xs">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </label>
  );
}
