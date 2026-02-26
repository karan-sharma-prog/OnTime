import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { Layout, Calendar, User, Bell, LogOut, Plus, Clock, MapPin, BookOpen, CheckCircle, AlertCircle, Upload, FileText, FileUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, DAYS, TimetableEntry, Notification } from './types';
import Papa from 'papaparse';
import { extractTimetableFromPDF as pdfExtract } from './pdfExtractor';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';

// Extract timetable from PDF using modular pipeline (grid-based + AI refinement)
const extractTimetableFromPDF = async (file: File) => {
  const result = await pdfExtract(file, OPENROUTER_API_KEY);

  if (result.errors.length > 0) {
    console.warn('[PDF Extraction Warnings]', result.errors);
  }
  console.log(`[PDF Extraction] ${result.rawCellCount} cells \u2192 ${result.finalEntryCount} valid entries`);

  return result.entries;
};

// --- Utility functions ---

const mergeSimultaneous = (entries: TimetableEntry[]) => {
  const groups = new Map<string, TimetableEntry[]>();

  entries.forEach(entry => {
    const key = `${entry.day}|${entry.start_time}|${entry.end_time}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  });

  return Array.from(groups.values()).map(slotEntries => {
    if (slotEntries.length <= 1) return slotEntries[0];

    return {
      ...slotEntries[0],
      subject: Array.from(new Set(slotEntries.map(e => e.subject))).join(' / '),
      room: Array.from(new Set(slotEntries.map(e => e.room).filter(Boolean))).join(', '),
      block: Array.from(new Set(slotEntries.map(e => e.block).filter(Boolean))).join(', '),
      class_name: Array.from(new Set(slotEntries.map(e => e.class_name).filter(Boolean))).join(', '),
      id: slotEntries[0].id, // Use the first ID for status tracking
    };
  });
};

const Button = ({ className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-md shadow-sky-200/50 hover:shadow-lg hover:shadow-cyan-300/50 ring-2 ring-transparent focus:ring-sky-500/50',
    secondary: 'bg-white/80 backdrop-blur-md text-stone-600 border border-stone-200/60 hover:bg-stone-50 shadow-sm hover:shadow active:bg-stone-100',
    danger: 'bg-gradient-to-r from-rose-400 to-rose-500 text-white hover:from-rose-500 hover:to-rose-600 shadow-md shadow-rose-200/50 hover:shadow-lg',
    ghost: 'bg-transparent text-stone-500 hover:bg-stone-100/50 hover:text-stone-800'
  };
  return (
    <button
      className={cn(
        'px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center',
        variants[variant as keyof typeof variants], className
      )}
      {...props}
    />
  );
};

const Card = ({ children, className }: any) => (
  <div className={cn('bg-white/80 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(14,165,233,0.03)] hover:shadow-[0_8px_30px_rgb(20,184,166,0.06)] transition-all duration-300 p-6', className)}>
    {children}
  </div>
);

const Input = ({ label, ...props }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-semibold text-stone-600 ml-1">{label}</label>}
    <input
      className="w-full px-4 py-3 rounded-xl border border-stone-200/60 bg-white/70 backdrop-blur-sm focus:bg-white focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none transition-all duration-200 shadow-sm hover:border-stone-300 placeholder:text-stone-400 text-stone-700"
      {...props}
    />
  </div>
);

const Select = ({ label, options, ...props }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-semibold text-stone-600 ml-1">{label}</label>}
    <select
      className="w-full px-4 py-3 rounded-xl border border-stone-200/60 bg-white/70 backdrop-blur-sm focus:bg-white focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none transition-all duration-200 shadow-sm hover:border-stone-300 cursor-pointer text-stone-700"
      {...props}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- Pages ---

const Dashboard = ({ classSessions }: { classSessions?: any[] }) => {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [freeTeachers, setFreeTeachers] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/dashboard/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setStats);

    fetch('/api/teachers/free', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setFreeTeachers);
  }, [token]);

  if (!stats) return <div className="p-8 text-center">Loading dashboard...</div>;

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 mt-2">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-sky-800 mb-2">Welcome back!</h1>
          <p className="text-stone-500 font-medium">Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-4 bg-white/80 backdrop-blur-xl border border-white shadow-[0_4px_20px_rgb(14,165,233,0.04)] rounded-3xl p-4 px-6 md:text-right">
          <div>
            <div className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-sky-500 to-teal-600">{stats.extra_classes}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mt-1">Extra Classes</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-sky-50 to-white/60 border-sky-100 shadow-sm shadow-sky-100/50 hover:shadow-md hover:shadow-sky-200/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-sky-600/80 uppercase tracking-widest mb-1">Total Classes</p>
              <h3 className="text-4xl font-black text-sky-950">{stats.today_classes.length}</h3>
            </div>
            <div className="p-3 bg-sky-100/80 text-sky-600 rounded-2xl shadow-inner"><BookOpen className="w-6 h-6" /></div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-white/60 border-emerald-100 shadow-sm shadow-emerald-100/50 hover:shadow-md hover:shadow-emerald-200/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-emerald-600/80 uppercase tracking-widest mb-1">Taken</p>
              <h3 className="text-4xl font-black text-emerald-950">{classSessions?.filter(s => s.status === 'taken').length || 0}</h3>
            </div>
            <div className="p-3 bg-emerald-100/80 text-emerald-600 rounded-2xl shadow-inner"><CheckCircle className="w-6 h-6" /></div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-white/60 border-rose-100 shadow-sm shadow-rose-100/50 hover:shadow-md hover:shadow-rose-200/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-rose-600/80 uppercase tracking-widest mb-1">Missed</p>
              <h3 className="text-4xl font-black text-rose-950">{classSessions?.filter(s => s.status === 'not_taken').length || 0}</h3>
            </div>
            <div className="p-3 bg-rose-100/80 text-rose-600 rounded-2xl shadow-inner"><AlertCircle className="w-6 h-6" /></div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-teal-50 to-teal-100/50 border-teal-200 shadow-md shadow-teal-200/40 hover:shadow-lg hover:shadow-teal-300/40 transform hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal-400/20 rounded-full blur-2xl group-hover:bg-teal-400/30 transition-all"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-black text-teal-700 uppercase tracking-widest mb-1">Extra Classes</p>
              <h3 className="text-5xl font-black text-teal-950 drop-shadow-sm">{stats.extra_classes}</h3>
            </div>
            <div className="p-3 bg-teal-500 text-white rounded-2xl shadow-lg shadow-teal-500/40"><Clock className="w-6 h-6" /></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="h-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-extrabold text-stone-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-500" /> Today's Schedule
              </h3>
            </div>
            <div className="space-y-4">
              {stats.today_classes.length === 0 && (
                <p className="text-stone-400 italic py-8 text-center bg-stone-50/50 rounded-2xl border border-dashed border-stone-200">No classes scheduled for today.</p>
              )}
              {mergeSimultaneous(stats.today_classes).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)).map((c: TimetableEntry) => {
                const session = classSessions?.find(s => s.timetable_id === c.id);
                const isTaken = session?.status === 'taken';
                const isMissed = session?.status === 'not_taken';

                let cardClass = "bg-stone-50/80 border-stone-100 hover:border-sky-200 hover:bg-white";
                let iconBg = "bg-sky-100 text-sky-700 group-hover:bg-sky-500 group-hover:text-white";
                let titleClass = "text-stone-900 group-hover:text-sky-700";

                if (isTaken) {
                  cardClass = "bg-emerald-50/50 border-emerald-200/60";
                  iconBg = "bg-emerald-400 text-white";
                  titleClass = "text-emerald-900";
                } else if (isMissed) {
                  cardClass = "bg-rose-50/50 border-rose-200/60 opacity-80";
                  iconBg = "bg-rose-400 text-white";
                  titleClass = "text-rose-900 line-through decoration-rose-300";
                }

                return (
                  <div key={c.id} className={cn("group flex items-center gap-5 p-5 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-md", cardClass)}>
                    <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center font-bold shadow-sm transition-colors duration-300", iconBg)}>
                      {isTaken ? <CheckCircle className="w-8 h-8" /> : isMissed ? <AlertCircle className="w-8 h-8" /> : c.start_time.split(':')[0]}
                    </div>
                    <div className="flex-1">
                      <div className={cn("font-bold text-lg mb-1 transition-colors", titleClass)}>{c.subject}</div>
                      <div className="text-sm font-medium text-stone-500 flex flex-wrap items-center gap-4 mt-1">
                        <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-stone-400" /> {c.start_time} - {c.end_time}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-stone-400" /> {c.block} {c.room}</span>
                        <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-stone-400" /> {c.class_name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold mb-5 flex items-center gap-3 text-slate-800">
              <div className="p-2 bg-orange-50 text-orange-500 rounded-xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              Substitutions
            </h2>
            <div className="space-y-3">
              {stats.today_substitutions.length === 0 && (
                <p className="text-slate-400 italic py-6 text-center text-sm">No substitution duties today.</p>
              )}
              {stats.today_substitutions.map((s: any) => (
                <div key={s.id} className="p-4 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200/50 hover:shadow-sm transition-all">
                  <div className="font-bold text-orange-900">{s.start_time} - {s.end_time}</div>
                  <div className="text-sm font-medium text-orange-700/80 mt-1">Extra class assigned</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold mb-5 flex items-center gap-3 text-slate-800">
              <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              Currently Free
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {freeTeachers.length === 0 && (
                <p className="text-slate-400 italic py-6 text-center text-sm">No teachers are currently free.</p>
              )}
              {freeTeachers.slice(0, 10).map((t: any) => (
                <div key={t.id} className="text-sm p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-100 transition-colors">
                  <div className="font-bold text-slate-800">{t.name}</div>
                  <div className="text-xs font-medium text-slate-500 mt-0.5">{t.department_name}</div>
                </div>
              ))}
              {freeTeachers.length > 10 && (
                <div className="pt-2 pb-1 text-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-full">+{freeTeachers.length - 10} more</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const Timetable = ({ classSessions }: { classSessions?: any[] }) => {
  const { token, user } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newEntry, setNewEntry] = useState({
    day: 'Monday',
    start_time: '09:00',
    end_time: '10:00',
    subject: '',
    room: '',
    block: '',
    class_name: ''
  });

  const fetchTimetable = () => {
    fetch('/api/timetable', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setEntries);
  };

  useEffect(fetchTimetable, [token]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let mappedData: any[] = [];

      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        // Use PapaParse for CSV
        const results = await new Promise<any>((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject
          });
        });

        const data = results.data as any[];
        mappedData = data.map(row => ({
          day: row.Day || row.day,
          start_time: row.StartTime || row.start_time || row['Start Time'],
          end_time: row.EndTime || row.end_time || row['End Time'],
          subject: row.Subject || row.subject,
          room: row.Room || row.room || '',
          block: row.Block || row.block || '',
          class_name: row.ClassName || row.class_name || row['Class Name'] || ''
        })).filter(row => row.day && row.start_time && row.subject);
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // Use pdfjs-dist for PDF extraction
        mappedData = await extractTimetableFromPDF(file);
      } else {
        alert('Unsupported file format. Please upload a PDF or CSV file.');
        setUploading(false);
        return;
      }

      if (mappedData.length === 0) {
        alert("No valid data found. Please ensure the file contains a clear timetable.");
        setUploading(false);
        return;
      }

      const res = await fetch('/api/timetable/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(mappedData)
      });

      if (res.ok) {
        setShowUpload(false);
        fetchTimetable();
        alert(`Successfully extracted and uploaded ${mappedData.length} classes.`);
      } else {
        alert("Upload failed. Please check the file content.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error processing file: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newEntry)
    });
    if (res.ok) {
      setShowAdd(false);
      fetchTimetable();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/timetable/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchTimetable();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-10 mt-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-sky-800">My Timetable</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowUpload(true)} className="flex items-center gap-2 group">
            <Upload className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition-colors" /> <span className="hidden sm:inline">Bulk Upload</span>
          </Button>
          <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2 shadow-sky-200/50">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Class</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-6">
        <div className="min-w-[800px] grid grid-cols-5 gap-6">
          {DAYS.map(day => (
            <div key={day} className="space-y-4">
              <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest text-center py-2.5 bg-slate-100/50 rounded-xl">
                {day}
              </h3>
              <div className="space-y-3 min-h-[200px]">
                {mergeSimultaneous(entries.filter(e => e.day === day)).sort((a, b) => a.start_time.localeCompare(b.start_time)).map((e, idx) => {
                  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day;
                  const session = isToday ? classSessions?.find(s => s.timetable_id === e.id) : null;

                  let bgClass = "bg-white/80 border-sky-100 hover:border-sky-300";
                  let borderClass = "bg-sky-400";
                  let textClass = "text-stone-800";

                  if (session?.status === 'taken') {
                    bgClass = "bg-emerald-50/80 border-emerald-200 hover:border-emerald-400";
                    borderClass = "bg-emerald-500";
                    textClass = "text-emerald-900";
                  } else if (session?.status === 'not_taken') {
                    bgClass = "bg-rose-50/80 border-rose-200 hover:border-rose-400 opacity-80";
                    borderClass = "bg-rose-500";
                    textClass = "text-rose-900 line-through decoration-rose-300";
                  }

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={e.id}
                      className={cn("group relative p-4 rounded-2xl backdrop-blur-xl border shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 overflow-hidden cursor-pointer", bgClass)}
                    >
                      <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-l-2xl opacity-80 group-hover:opacity-100 transition-opacity", borderClass)}></div>
                      <div className="font-bold mb-1 ml-2 text-[15px] leading-tight">{e.subject}</div>
                      <div className="text-xs font-semibold text-stone-500 bg-stone-50 inline-block px-2.5 py-1 rounded-md ml-2 border border-stone-100 flex items-center gap-1.5 w-fit">
                        <Clock className={cn("w-3 h-3", session?.status === 'taken' ? 'text-emerald-500' : session?.status === 'not_taken' ? 'text-rose-500' : 'text-sky-500')} />
                        {e.start_time} - {e.end_time}
                      </div>
                      <div className="text-[11px] font-medium text-stone-400 ml-2 mt-2">{e.room} • {e.class_name}</div>

                      {/* Delete button (only show if not evaluating status) */}
                      {!session && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }}
                          className="absolute -top-2 -right-2 w-7 h-7 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-200 hover:scale-110 shadow-sm"
                        >
                          ×
                        </button>
                      )}
                    </motion.div>
                  );
                })}
                {entries.filter(e => e.day === day).length === 0 && (
                  <div className="h-32 border-2 border-dashed border-stone-200/60 rounded-2xl flex items-center justify-center">
                    <span className="text-sm font-medium text-stone-400">No classes</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-white/90 backdrop-blur-2xl rounded-[2rem] p-8 w-full max-w-md shadow-2xl border border-white/60"
            >
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 mb-6">Add New Class</h2>
              {/* Form content */}
              <form onSubmit={handleAdd} className="space-y-5">
                <Select
                  label="Day"
                  options={DAYS.map(d => ({ value: d, label: d }))}
                  value={newEntry.day}
                  onChange={(e: any) => setNewEntry({ ...newEntry, day: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Start Time"
                    type="time"
                    value={newEntry.start_time}
                    onChange={(e: any) => setNewEntry({ ...newEntry, start_time: e.target.value })}
                  />
                  <Input
                    label="End Time"
                    type="time"
                    value={newEntry.end_time}
                    onChange={(e: any) => setNewEntry({ ...newEntry, end_time: e.target.value })}
                  />
                </div>
                <Input
                  label="Subject"
                  placeholder="e.g. Mathematics"
                  value={newEntry.subject}
                  onChange={(e: any) => setNewEntry({ ...newEntry, subject: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Block"
                    placeholder="A"
                    value={newEntry.block}
                    onChange={(e: any) => setNewEntry({ ...newEntry, block: e.target.value })}
                  />
                  <Input
                    label="Room"
                    placeholder="101"
                    value={newEntry.room}
                    onChange={(e: any) => setNewEntry({ ...newEntry, room: e.target.value })}
                  />
                </div>
                <Input
                  label="Class Name"
                  placeholder="Grade 10-A"
                  value={newEntry.class_name}
                  onChange={(e: any) => setNewEntry({ ...newEntry, class_name: e.target.value })}
                />
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="ghost" className="flex-1 bg-slate-100" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save Class</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showUpload && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-white/90 backdrop-blur-2xl rounded-[2rem] p-8 w-full max-w-md shadow-2xl border border-white/60"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                  <FileUp className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Upload Timetable</h2>
              </div>
              <p className="text-sm text-slate-500 font-medium mb-8">Upload a PDF timetable or CSV file to immediately import your schedule.</p>

              <div className="bg-sky-50/50 rounded-2xl p-5 mb-8 border border-sky-100/50">
                <h4 className="text-[10px] font-black tracking-widest text-sky-400 uppercase mb-3">Supported Formats</h4>
                <div className="flex flex-wrap gap-2">
                  {['PDF', 'CSV'].map(fmt => (
                    <span key={fmt} className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-sky-600 border border-sky-100 shadow-sm">{fmt}</span>
                  ))}
                </div>
              </div>

              <input
                type="file"
                accept=".csv,.pdf"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />

              <div className="space-y-4">
                <Button
                  className="w-full flex items-center justify-center gap-2 py-8 border-2 border-dashed border-sky-200/80 bg-white text-sky-600 hover:bg-sky-50/50 hover:border-sky-400 group transition-all rounded-[1.5rem]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileUp className="w-10 h-10 group-hover:-translate-y-1.5 transition-transform duration-300 drop-shadow-sm" />
                    <span className="font-bold text-lg">{uploading ? 'Extracting Data...' : 'Select PDF or CSV File'}</span>
                    <span className="text-xs font-medium text-slate-400">Drag and drop also supported</span>
                  </div>
                </Button>
                <Button variant="ghost" className="w-full bg-slate-100" onClick={() => setShowUpload(false)}>Cancel</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LeaveSubstitution = () => {
  const { token, user } = useAuth();
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [selectedClass, setSelectedClass] = useState<TimetableEntry | null>(null);
  const [substitutes, setSubstitutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/timetable', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setTimetable);
  }, [token]);

  const findSubstitutes = async (entry: TimetableEntry) => {
    setLoading(true);
    setSelectedClass(entry);
    const params = new URLSearchParams({
      day: entry.day,
      start_time: entry.start_time,
      end_time: entry.end_time,
      subject: entry.subject,
      department_id: user?.department_id?.toString() || ''
    });
    const res = await fetch(`/api/substitutes/suggest?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setSubstitutes(data);
    setLoading(false);
  };

  const assignSubstitute = async (subId: number) => {
    if (!selectedClass) return;

    // 1. Create leave
    const leaveRes = await fetch('/api/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0], // For demo, assuming today
        start_time: selectedClass.start_time,
        end_time: selectedClass.end_time
      })
    });
    const leave = await leaveRes.json();

    // 2. Create substitution
    const subRes = await fetch('/api/substitutions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        leave_id: leave.id,
        substitute_teacher_id: subId,
        original_teacher_id: user?.id,
        date: new Date().toISOString().split('T')[0],
        start_time: selectedClass.start_time,
        end_time: selectedClass.end_time
      })
    });

    if (subRes.ok) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSelectedClass(null);
      }, 2000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-sky-800 mb-8 mt-2">Mark Leave & Substitute</h1>

      {!selectedClass ? (
        <div className="space-y-5">
          <p className="text-slate-500 font-medium">Select a class you want to assign a substitute for:</p>
          <div className="grid grid-cols-1 gap-4">
            {mergeSimultaneous(timetable).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)).map(e => (
              <button
                key={e.id}
                onClick={() => findSubstitutes(e)}
                className="group flex items-center justify-between p-5 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgb(0,0,0,0.06)] rounded-2xl hover:border-sky-200 transition-all duration-300 text-left transform hover:-translate-y-0.5"
              >
                <div>
                  <div className="font-bold text-slate-800 text-lg">{e.subject}</div>
                  <div className="text-sm font-medium text-slate-500 flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{e.day}</span>
                    <span>{e.start_time} - {e.end_time}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
                  <Plus className="w-5 h-5 text-slate-400 group-hover:text-sky-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <Card className="bg-gradient-to-br from-sky-50/80 to-teal-50/50 border-sky-100/50 shadow-md shadow-sky-100/20">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-sky-400/80 mb-2">Selected Class</div>
                <div className="text-2xl font-bold text-sky-950 mb-1">{selectedClass.subject}</div>
                <div className="text-sky-700 font-medium flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-sky-100/50 rounded text-xs">{selectedClass.day}</span>
                  {selectedClass.start_time} - {selectedClass.end_time}
                </div>
              </div>
              <Button variant="ghost" className="bg-white/50 hover:bg-white/80" onClick={() => setSelectedClass(null)}>Change</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-3 text-lg">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <User className="w-5 h-5" />
              </div>
              Suggested Substitutes
            </h3>
            {loading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium animate-pulse">Finding available teachers...</p>
              </div>
            ) : substitutes.length === 0 ? (
              <div className="py-16 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No available teachers found for this slot.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {substitutes.map(s => (
                  <div key={s.id} className="group flex items-center justify-between p-5 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgb(0,0,0,0.06)] rounded-2xl transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-100 to-teal-100 text-sky-600 flex items-center justify-center font-bold text-lg">
                        {s.name[0]}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-lg">{s.name}</div>
                        <div className="text-sm font-medium text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{s.department_name}</span>
                          {s.subject_specialization || 'General'}
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => assignSubstitute(s.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shadow-sky-200/50">Send Request</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-xl shadow-emerald-600/20 flex items-center gap-3 font-semibold z-[70]"
          >
            <CheckCircle className="w-6 h-6" /> Substitution Assigned Successfully
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Profile = () => {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-sky-800 mb-8 mt-2 text-center md:text-left">My Profile</h1>
      <Card className="text-center relative overflow-hidden p-0">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 opacity-90"></div>
        <div className="relative pt-12 pb-8">
          <div className="w-32 h-32 bg-white/90 backdrop-blur-md text-indigo-600 rounded-[2rem] flex items-center justify-center text-5xl font-extrabold mx-auto mb-6 shadow-xl shadow-indigo-900/10 border-4 border-white transform hover:rotate-3 transition-transform duration-300">
            {user.name[0]}
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 mb-1">{user.name}</h1>
          <p className="text-slate-500 font-medium mb-8 bg-slate-100/50 inline-block px-4 py-1.5 rounded-full">{user.email}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left mb-10 mt-4 px-6 md:px-10">
            <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-100 hover:shadow-md hover:bg-white transition-all">
              <div className="text-[11px] text-slate-400 uppercase font-black tracking-widest mb-1.5 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Department</div>
              <div className="font-bold text-slate-800 text-lg">{user.department_name || 'Not assigned'}</div>
            </div>
            <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-100 hover:shadow-md hover:bg-white transition-all">
              <div className="text-[11px] text-slate-400 uppercase font-black tracking-widest mb-1.5 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Employee ID</div>
              <div className="font-bold text-slate-800 text-lg">{user.employee_id || 'N/A'}</div>
            </div>
            <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-100 hover:shadow-md hover:bg-white transition-all">
              <div className="text-[11px] text-slate-400 uppercase font-black tracking-widest mb-1.5 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Specialization</div>
              <div className="font-bold text-slate-800 text-lg">{user.subject_specialization || 'N/A'}</div>
            </div>
            <div className="p-5 bg-indigo-50/80 rounded-2xl border border-indigo-100 hover:shadow-md hover:bg-indigo-50 transition-all">
              <div className="text-[11px] text-indigo-400/80 uppercase font-black tracking-widest mb-1.5 flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Extra Classes</div>
              <div className="font-bold text-indigo-700 text-2xl">{user.extra_classes}</div>
            </div>
          </div>

          <div className="px-6 md:px-10">
            <Button variant="danger" className="w-full py-4 text-[15px] flex items-center justify-center gap-3 rounded-2xl font-bold bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 shadow-rose-200/50" onClick={logout}>
              <LogOut className="w-5 h-5" /> Secure Sign Out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Notifications = () => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = () => {
    fetch('/api/notifications', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setNotifications);
  };

  useEffect(fetchNotifications, [token]);

  const respondToSubstitution = async (id: string, status: 'confirmed' | 'rejected') => {
    await fetch(`/api/substitutions/${id}/respond`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    fetchNotifications();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 mt-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-indigo-800">Notifications</h1>
        <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold shadow-sm shadow-indigo-100/50">{notifications.filter(n => !n.is_read).length} New</div>
      </div>
      <div className="space-y-4">
        {notifications.length === 0 && (
          <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">You're all caught up!</p>
          </div>
        )}
        {notifications.map(n => (
          <div key={n.id} className={cn("p-5 rounded-2xl border flex gap-5 transition-all duration-300 hover:shadow-md", n.is_read ? "bg-white/70 backdrop-blur-md border-white/60 hover:bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)]" : "bg-gradient-to-r from-indigo-50/80 to-white/80 backdrop-blur-md border-indigo-100/50 shadow-sm shadow-indigo-500/5")}>
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
              n.type === 'reminder' ? "bg-blue-100 text-blue-600 shadow-blue-200/50" :
                n.type === 'request' ? "bg-orange-100 text-orange-600 shadow-orange-200/50" :
                  "bg-emerald-100 text-emerald-600 shadow-emerald-200/50"
            )}>
              {n.type === 'reminder' ? <Clock className="w-6 h-6" /> :
                n.type === 'request' ? <AlertCircle className="w-6 h-6" /> :
                  <CheckCircle className="w-6 h-6" />}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className={cn("text-slate-800", n.is_read ? "font-medium" : "font-bold")}>{n.message}</p>
                {!n.is_read && <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full shrink-0 mr-1 mt-1.5 shadow-sm shadow-indigo-400/50"></span>}
              </div>
              <p className="text-xs text-slate-400 font-medium">{new Date(n.created_at).toLocaleString(undefined, {
                weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}</p>
              {n.type === 'request' && n.related_id && (
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="primary"
                    className="py-1.5 px-4 text-xs"
                    onClick={() => respondToSubstitution(n.related_id!, 'confirmed')}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    className="py-1.5 px-4 text-xs"
                    onClick={() => respondToSubstitution(n.related_id!, 'rejected')}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Auth Screens ---

const AuthScreen = () => {
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department_id: '',
    subject_specialization: '',
    employee_id: ''
  });
  const [departments, setDepartments] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/departments').then(res => res.json()).then(setDepartments);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (res.ok) {
      login(data.token, data.user);
    } else {
      setError(data.error || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background blobs specific to Auth */}
      <div className="absolute top-[10%] left-[10%] w-[35rem] h-[35rem] bg-sky-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob z-0 pointer-events-none"></div>
      <div className="absolute top-[20%] right-[10%] w-[35rem] h-[35rem] bg-amber-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-2000 z-0 pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white/80 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_8px_40px_rgb(14,165,233,0.06)] border border-white p-8 sm:p-10 w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-sky-200/60 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-stone-800 to-stone-600 mb-2 tracking-tight">EduSched</h1>
          <p className="text-stone-500 font-medium">{isLogin ? 'Welcome back, Teacher' : 'Join our faculty network'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <Input
              label="Full Name"
              placeholder="John Doe"
              required
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
            />
          )}
          <Input
            label="Email Address"
            type="email"
            placeholder="john@school.edu"
            required
            value={formData.email}
            onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            required
            value={formData.password}
            onChange={(e: any) => setFormData({ ...formData, password: e.target.value })}
          />
          <AnimatePresence>
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <Select
                  label="Department"
                  options={[
                    { value: '', label: 'Select Department' },
                    ...departments.map(d => ({ value: d.id, label: d.name }))
                  ]}
                  required
                  value={formData.department_id}
                  onChange={(e: any) => setFormData({ ...formData, department_id: e.target.value })}
                />
                <Input
                  label="Subject Specialization"
                  placeholder="e.g. Physics"
                  value={formData.subject_specialization}
                  onChange={(e: any) => setFormData({ ...formData, subject_specialization: e.target.value })}
                />
                <Input
                  label="Employee ID"
                  placeholder="EMP123"
                  value={formData.employee_id}
                  onChange={(e: any) => setFormData({ ...formData, employee_id: e.target.value })}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="text-sm text-rose-600 bg-rose-50/80 backdrop-blur-sm border border-rose-100 p-3 rounded-xl font-medium mt-4">
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" className="w-full py-3.5 mt-8 text-[15px]">
            {isLogin ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-stone-500 font-medium">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <button
            type="button"
            className="text-sky-600 font-bold hover:text-teal-600 hover:underline underline-offset-4 transition-all"
            onClick={(e) => {
              e.preventDefault();
              setIsLogin(!isLogin);
              setError('');
            }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

const AppContent = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Class Session Status State
  const [classSessions, setClassSessions] = useState<any[]>([]);
  const [pendingClass, setPendingClass] = useState<TimetableEntry | null>(null);
  const [upcomingClass, setUpcomingClass] = useState<TimetableEntry | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Show welcome on first load
  useEffect(() => {
    if (user && !sessionStorage.getItem('welcome-shown')) {
      setShowWelcome(true);
      sessionStorage.setItem('welcome-shown', 'true');
    }
  }, [user]);

  // Fetch today's sessions and check for pending completions
  useEffect(() => {
    if (!token || !user) return;

    const today = new Date().toISOString().split('T')[0];
    const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

    const checkPendingSessions = async () => {
      try {
        // Fetch sessions
        const sessionRes = await fetch(`/api/class-sessions?date=${today}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const sessions = await sessionRes.json();
        setClassSessions(sessions);

        // Fetch timetable
        const timetableRes = await fetch('/api/timetable', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const timetable = await timetableRes.json() as TimetableEntry[];

        const todaysClasses = timetable.filter((t: any) => t.day === todayName);
        const currentTime = new Date().toTimeString().slice(0, 5); // HH:MM

        // Find the first class that has ended but has no session recorded
        const pending = todaysClasses.find((c: any) => {
          const hasEnded = c.end_time <= currentTime;
          const isRecorded = sessions.some((s: any) => s.timetable_id === c.id);
          return hasEnded && !isRecorded;
        });

        if (pending) {
          setPendingClass(pending);
        }

        // Find classes starting in 5 minutes
        const in5Min = new Date(new Date().getTime() + 5 * 60000).toTimeString().slice(0, 5);
        const upcoming = todaysClasses.find((c: any) => c.start_time === in5Min);
        if (upcoming && !sessionStorage.getItem(`reminded-${upcoming.id}-${today}`)) {
          setUpcomingClass(upcoming);
          sessionStorage.setItem(`reminded-${upcoming.id}-${today}`, 'true');
        }
      } catch (err) {
        console.error("Error checking class sessions", err);
      }
    };

    checkPendingSessions();
    const interval = setInterval(checkPendingSessions, 30000); // Check every 30s for better accuracy
    return () => clearInterval(interval);
  }, [token, user]);

  const handleSessionSubmit = async (status: 'taken' | 'not_taken') => {
    if (!pendingClass) return;

    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch('/api/class-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          timetable_id: pendingClass.id,
          date: today,
          status
        })
      });

      if (res.ok) {
        setPendingClass(null);
        // Add optimistic update to trigger re-renders natively
        setClassSessions(prev => [...prev, { timetable_id: pendingClass.id, status }]);
      }
    } catch (err) {
      console.error("Failed to submit session status", err);
    }
  };

  if (!user) {
    return <AuthScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard classSessions={classSessions} />;
      case 'timetable': return <Timetable classSessions={classSessions} />;
      case 'leave': return <LeaveSubstitution />;
      case 'notifications': return <Notifications />;
      case 'profile': return <Profile />;
      default: return <Dashboard classSessions={classSessions} />;
    }
  };

  return (
    <div className="min-h-screen pb-24 md:pb-6 md:pl-72 flex w-full relative">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col fixed left-4 top-4 bottom-4 w-64 bg-white/80 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgb(14,165,233,0.04)] rounded-[2rem] p-6 z-50">
        <div className="flex items-center gap-3 mb-10 px-2 cursor-pointer group">
          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-200/50 group-hover:rotate-6 transition-transform duration-300">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-stone-800 to-stone-600 tracking-tight">EduSched</span>
        </div>

        <nav className="flex-1 space-y-2.5">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Layout },
            { id: 'timetable', label: 'My Timetable', icon: Calendar },
            { id: 'leave', label: 'Substitution', icon: Clock },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'profile', label: 'Profile', icon: User },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold transition-all duration-300 relative group overflow-hidden",
                activeTab === item.id
                  ? "text-sky-700 bg-sky-50/80 shadow-sm border border-sky-100/50"
                  : "text-stone-500 hover:bg-stone-50/80 hover:text-stone-900 border border-transparent"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-transform duration-300", activeTab === item.id ? "scale-110" : "group-hover:scale-110")} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 bg-stone-50/80 border border-stone-100/50 rounded-2xl shadow-sm backdrop-blur-sm">
          <div className="text-[10px] text-stone-400 uppercase font-black tracking-wider mb-2">Logged in as</div>
          <div className="font-bold text-stone-900 truncate">{user.name}</div>
          <div className="text-xs text-stone-500 font-medium truncate">{user.email}</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-full pt-4 md:pt-4 md:pr-4 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav - Mobile */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-3xl border border-white/80 shadow-[0_8px_40px_rgb(14,165,233,0.08)] rounded-3xl flex justify-around p-3 z-50">
        {[
          { id: 'dashboard', icon: Layout },
          { id: 'timetable', icon: Calendar },
          { id: 'leave', icon: Clock },
          { id: 'notifications', icon: Bell },
          { id: 'profile', icon: User },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300 relative",
              activeTab === item.id ? "text-sky-600 bg-sky-50" : "text-stone-400 hover:text-stone-600 hover:bg-stone-50/50"
            )}
          >
            <item.icon className="w-6 h-6 relative z-10" />
          </button>
        ))}
      </nav>

      {/* Class Completion Popup Modal */}
      <AnimatePresence>
        {pendingClass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-[100]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-white/90 backdrop-blur-2xl p-8 rounded-[2rem] w-full max-w-md shadow-2xl border border-white relative overflow-hidden text-center"
            >
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-sky-400 to-teal-400"></div>

              <div className="w-16 h-16 bg-sky-100 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-inner">
                <Clock className="w-8 h-8 text-sky-600 animate-pulse" />
              </div>

              <h2 className="text-2xl font-black text-stone-900 mb-2">Class Ended!</h2>
              <p className="text-stone-500 font-medium mb-6">
                Your <span className="text-stone-800 font-bold">{pendingClass.subject}</span> class ({pendingClass.start_time} - {pendingClass.end_time}) has ended.
                <br />Was this class successfully taken?
              </p>

              <div className="flex gap-4">
                <Button
                  onClick={() => handleSessionSubmit('not_taken')}
                  variant="danger"
                  className="flex-1 py-4 text-lg bg-gradient-to-r from-rose-100 to-rose-200 text-rose-700 hover:from-rose-200 hover:to-rose-300 shadow-none hover:shadow-none"
                >
                  No, Missed
                </Button>
                <Button
                  onClick={() => handleSessionSubmit('taken')}
                  className="flex-1 py-4 text-lg bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-200/50 hover:shadow-emerald-300/50"
                >
                  Yes, Taken
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcome Popup */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xl flex items-center justify-center p-4 z-[110]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 40, opacity: 0 }}
              className="bg-white/95 backdrop-blur-3xl p-10 rounded-[3rem] w-full max-w-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white relative overflow-hidden text-center"
            >
              <div className="absolute top-0 inset-x-0 h-3 bg-gradient-to-r from-sky-400 via-indigo-500 to-teal-400"></div>

              <div className="w-24 h-24 bg-gradient-to-br from-sky-100 to-indigo-50 rounded-3xl mx-auto flex items-center justify-center mb-8 shadow-xl shadow-sky-100/50 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                <span className="text-4xl font-black text-sky-600">👋</span>
              </div>

              <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Hello, {user?.name}!</h2>
              <div className="h-1 w-20 bg-sky-200 mx-auto mb-6 rounded-full"></div>

              <p className="text-xl font-medium text-slate-500 leading-relaxed mb-10 max-w-sm mx-auto italic">
                "A beautiful day to inspire, educate, and make a difference. Your presence makes this school better."
              </p>

              <Button
                onClick={() => setShowWelcome(false)}
                className="w-full py-4.5 text-lg font-bold rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-xl shadow-sky-200/50"
              >
                Let's Get Started
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upcoming Class Popup */}
      <AnimatePresence>
        {upcomingClass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-sky-950/40 backdrop-blur-md flex items-center justify-center p-4 z-[110]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              className="bg-white/95 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-white text-center"
            >
              <div className="w-20 h-20 bg-amber-50 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-inner ring-4 ring-amber-100/50">
                <Bell className="w-10 h-10 text-amber-500 animate-bounce" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-2">Class Starting Soon!</h2>
              <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                Your <span className="text-sky-600 font-bold">{upcomingClass.subject}</span> class starts in <span className="font-bold text-slate-800">5 minutes</span>.
                <br />Location: <span className="font-bold text-slate-800">{upcomingClass.block} {upcomingClass.room}</span>
              </p>

              <Button
                onClick={() => setUpcomingClass(null)}
                className="w-full py-4 font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Got it, thanks!
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <AuthScreen />;

  return <AppContent />;
}
