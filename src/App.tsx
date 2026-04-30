/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Settings, Train, ArrowRight, RefreshCw, X, ChevronRight, ChevronDown, Loader2, MapPin, GripVertical } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { Config, Commute, Station, NormalizedDeparture } from './types';
import { searchStations, getDepartures, checkHealth } from './api';
import { Activity, CheckCircle, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'db_monitor_config';

const HealthStatus: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const res = await checkHealth();
      setData(res);
    } catch (e) {
      console.error('Health check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); const i = setInterval(check, 60000); return () => clearInterval(i); }, []);

  if (!data) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm ${data.healthy ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
        <Activity className={`w-3 h-3 ${loading ? 'animate-pulse' : ''}`} />
        <span>API STATUS: {data.healthy ? 'ONLINE' : 'OFFLINE'}</span>
        <button onClick={check} className="hover:opacity-70">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const App: React.FC = () => {
  const [config, setConfig] = useState<Config>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      let data: Config | null = null;
      if (saved) {
        data = JSON.parse(saved);
      }
      
      // Default routes if empty or first run
      if (!data || !data.commutes || data.commutes.length === 0) {
        const stations = {
          sprotze: { id: '8005640', name: 'Sprötze' },
          hamburg: { id: '8002549', name: 'Hamburg Hbf' },
          tonndorf: { id: '8006197', name: 'Hamburg-Tonndorf' }
        };

        return {
          commutes: [
            { id: 'def-1', from: stations.sprotze, to: stations.hamburg },
            { id: 'def-2', from: stations.hamburg, to: stations.sprotze },
            { id: 'def-3', from: stations.tonndorf, to: stations.hamburg },
            { id: 'def-4', from: stations.hamburg, to: stations.tonndorf }
          ]
        };
      }
      return data;
    } catch (e) {
      return { commutes: [] };
    }
  });

  const [isAddingMode, setIsAddingMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState<Date>(new Date());

  const refreshAll = () => {
    setRefreshKey(k => k + 1);
    setLastGlobalUpdate(new Date());
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const addCommute = (from: Station, to: Station) => {
    const newCommute: Commute = {
      id: generateId(),
      from,
      to,
    };
    setConfig(prev => ({ ...prev, commutes: [...prev.commutes, newCommute] }));
    setIsAddingMode(false);
  };

  const removeCommute = (id: string) => {
    setConfig(prev => ({ ...prev, commutes: prev.commutes.filter(c => c.id !== id) }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Train className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">DB Monitor</h1>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={refreshAll}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-2"
            title="Refresh All"
          >
            <RefreshCw className="w-5 h-5 text-slate-600" />
          </button>
          <button 
            onClick={() => setIsAddingMode(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            id="add-route-btn"
          >
            <Plus className="w-6 h-6 text-slate-600" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Last update: {lastGlobalUpdate.toLocaleTimeString()}
          </p>
        </div>
        <Reorder.Group 
          axis="y" 
          values={config.commutes} 
          onReorder={(newOrder) => setConfig({ ...config, commutes: newOrder })}
          className="space-y-6"
        >
          <AnimatePresence mode="popLayout">
            {config.commutes.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key="empty"
                className="flex flex-col items-center justify-center py-20 text-center space-y-4"
                id="empty-state"
              >
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-10 h-10 text-slate-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">No commutes saved</h2>
                  <p className="text-slate-500">Add your daily route to see real-time updates.</p>
                </div>
                <button 
                  onClick={() => setIsAddingMode(true)}
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  Add First Commute
                </button>
              </motion.div>
            ) : (
              config.commutes.map(commute => (
                <CommuteItem 
                  key={commute.id}
                  commute={commute} 
                  onRemove={() => removeCommute(commute.id)} 
                  refreshKey={refreshKey}
                />
              ))
            )}
          </AnimatePresence>
        </Reorder.Group>

        <HealthStatus />
      </main>

      {/* Auto refresh trigger hidden */}
      <AutoRefresh onRefresh={refreshAll} />

      {/* Overlay Modal for Adding Route */}
      <AnimatePresence>
        {isAddingMode && (
          <RouteConfigurator 
            onClose={() => setIsAddingMode(false)}
            onSave={addCommute}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const AutoRefresh: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const onRefreshRef = React.useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const interval = setInterval(() => {
      onRefreshRef.current();
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  return null;
};

const CommuteItem: React.FC<{ commute: Commute; onRemove: () => void; refreshKey: number }> = ({ commute, onRemove, refreshKey }) => {
  const [departures, setDepartures] = useState<NormalizedDeparture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const controls = useDragControls();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDepartures(commute.from.id, commute.to.id);
      setDepartures(data.slice(0, 3));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }, [commute]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const displayedDepartures = isCollapsed ? departures.slice(0, 1) : departures;

  return (
    <Reorder.Item
      value={commute}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
    >
      <div className="bg-slate-50 border-b border-slate-100 px-2 py-3 flex items-center justify-between cursor-pointer select-none" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-center gap-1 font-medium text-slate-700 overflow-hidden min-w-0 flex-1">
          <div 
            className="p-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400"
            onPointerDown={(e) => controls.start(e)}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
          <span className="truncate">{commute.from.name}</span>
          <ArrowRight className="w-4 h-4 flex-shrink-0 text-slate-400" />
          <span className="truncate">{commute.to.name}</span>
        </div>
        <div className="flex items-center gap-1 pl-2" onClick={(e) => e.stopPropagation()}>
          <button 
            onClick={fetchData}
            className="p-1.5 hover:bg-white rounded-lg text-slate-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={onRemove}
            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-1">
        {loading && departures.length === 0 ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="py-6 px-4 text-center space-y-3">
            <p className="text-red-500 text-sm font-medium">{error}</p>
            <button 
              onClick={fetchData}
              className="text-xs text-blue-600 font-bold hover:underline"
            >
              Try again
            </button>
          </div>
        ) : departures.length === 0 ? (
          <div className="py-8 px-4 text-center text-slate-400 text-sm">
            No upcoming trains in the next 2 hours.
          </div>
        ) : (
          <motion.div 
            layout
            className="divide-y divide-slate-50"
          >
            <AnimatePresence initial={false}>
              {displayedDepartures.map((dep) => (
                <motion.div
                  key={dep.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <DepartureRow departure={dep} />
                </motion.div>
              ))}
            </AnimatePresence>
            {!isCollapsed && departures.length > 1 && (
              <button 
                onClick={() => setIsCollapsed(true)}
                className="w-full py-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors bg-slate-50/30"
              >
                SHOW LESS
              </button>
            )}
            {isCollapsed && departures.length > 1 && (
              <button 
                onClick={() => setIsCollapsed(false)}
                className="w-full py-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors bg-blue-50/10"
              >
                SHOW {departures.length - 1} MORE DEPARTURES
              </button>
            )}
          </motion.div>
        )}
      </div>
    </Reorder.Item>
  );
};

const DepartureRow: React.FC<{ departure: NormalizedDeparture }> = ({ departure }) => {
  const plannedTime = new Date(departure.plannedDeparture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const actualTime = new Date(departure.actualDeparture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (departure.isCancelled) {
    return (
      <div className="p-3 bg-red-50/50 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-bold text-slate-900">{departure.line}</span>
          <span className="text-xs text-slate-500">{departure.direction}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-red-600 font-bold px-2 py-0.5 bg-red-100 rounded text-xs">CANCELLED</span>
          <span className="text-sm text-slate-400 line-through">{plannedTime}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex flex-col justify-center items-center w-12 h-12 bg-slate-100 rounded-xl">
           <span className="text-[10px] font-bold text-slate-500 uppercase leading-none mb-1">PLATF.</span>
           <span className={`text-sm font-black ${departure.isPlatformChange ? 'text-amber-600' : 'text-slate-700'}`}>
            {departure.platform}
           </span>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 leading-tight">{departure.line}</span>
          <span className="text-xs text-slate-500 truncate max-w-[120px]">{departure.direction}</span>
        </div>
      </div>

      <div className="flex flex-col items-end">
        <div className="flex items-baseline gap-1.5">
          {departure.delay > 0 && (
            <span className="text-[10px] font-bold text-red-500">+{departure.delay}m</span>
          )}
          <span className={`text-lg font-black tracking-tight ${departure.delay > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {actualTime}
          </span>
        </div>
        {departure.delay > 0 && (
          <span className="text-[10px] text-slate-400 line-through leading-none">{plannedTime}</span>
        )}
      </div>
    </div>
  );
};

const RouteConfigurator: React.FC<{ onClose: () => void; onSave: (from: Station, to: Station) => void }> = ({ onClose, onSave }) => {
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white flex flex-col pt-safe"
      id="route-configurator"
    >
      <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-xl font-bold">Add new commute</h2>
        <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-slate-100">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="p-4 space-y-8 flex-1 overflow-auto">
        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Starting Station</label>
            <Autocomplete 
              placeholder="e.g. Hamburg Hbf" 
              onSelect={setFrom} 
              selected={from}
              id="from-search"
            />
          </div>

          <div className="relative">
            <div className="absolute left-1/2 -top-1  w-12 h-12 bg-white -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10">
               <div className="bg-slate-100 p-2 rounded-full">
                  <ArrowRight className="w-4 h-4 text-slate-400 rotate-90" />
               </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Destination Station</label>
            <Autocomplete 
              placeholder="e.g. Lübeck Hbf" 
              onSelect={setTo} 
              selected={to}
              id="to-search"
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <button 
          disabled={!from || !to || from.id === to.id}
          onClick={() => from && to && onSave(from, to)}
          className="w-full bg-blue-600 disabled:bg-slate-300 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
          id="save-route-btn"
        >
          <span>Save Route</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};

const Autocomplete: React.FC<{ placeholder: string; onSelect: (s: Station) => void; selected: Station | null; id: string }> = ({ placeholder, onSelect, selected, id }) => {
  const [query, setQuery] = useState(selected?.name || '');
  const [results, setResults] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 2 || (selected && query === selected.name)) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchStations(query);
        setResults(data.filter((s: any) => s.type === 'station').map((s: any) => ({ id: s.id, name: s.name })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selected]);

  return (
    <div className="relative">
      <div className={`relative flex items-center bg-slate-100 rounded-2xl border-2 transition-all ${focused ? 'border-blue-500 bg-white ring-4 ring-blue-50' : 'border-transparent'}`}>
        <MapPin className={`w-5 h-5 ml-4 transition-colors ${focused ? 'text-blue-500' : 'text-slate-400'}`} />
        <input 
          type="text"
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-4 outline-none font-medium placeholder:text-slate-400"
        />
        {loading && <Loader2 className="w-5 h-5 mr-4 animate-spin text-blue-500" />}
      </div>

      <AnimatePresence>
        {focused && results.length > 0 && (
          <motion.ul 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 max-h-60 overflow-auto"
          >
            {results.map(res => (
              <li 
                key={res.id}
                onClick={() => {
                  onSelect(res);
                  setQuery(res.name);
                  setResults([]);
                }}
                className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex flex-col"
              >
                <span className="font-semibold text-slate-800">{res.name}</span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">ID: {res.id}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
