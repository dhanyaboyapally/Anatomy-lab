import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  StickyNote, X, Plus, GripVertical, Check,
  Bold, Italic, Underline, Highlighter, Type, Tag,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FontStyle = 'sans' | 'serif' | 'mono' | 'handwrite1' | 'handwrite2'

interface Note {
  id: string
  html: string        // stored as innerHTML
  x: number
  y: number
  color: string
  font: FontStyle
  linkedStructure?: string
  createdAt: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const NOTE_COLORS = [
  { bg: '#fef9c3', border: '#ca8a04', text: '#713f12', name: 'yellow' },
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a5f', name: 'blue'   },
  { bg: '#dcfce7', border: '#22c55e', text: '#14532d', name: 'green'  },
  { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d', name: 'red'    },
  { bg: '#f3e8ff', border: '#a855f7', text: '#4a1d96', name: 'purple' },
  { bg: '#fff7ed', border: '#f97316', text: '#7c2d12', name: 'orange' },
]

const FONT_OPTIONS: { id: FontStyle; label: string; css: string }[] = [
  { id: 'sans',       label: 'Clean',     css: 'system-ui, sans-serif' },
  { id: 'serif',      label: 'Serif',     css: 'Georgia, serif' },
  { id: 'mono',       label: 'Mono',      css: '"Courier New", monospace' },
  { id: 'handwrite1', label: 'Script',    css: '"Segoe Script", "Comic Sans MS", cursive' },
  { id: 'handwrite2', label: 'Casual',    css: '"Comic Sans MS", "Chalkboard SE", cursive' },
]

// Med-student quick-insert snippets
const QUICK_SNIPPETS = [
  { label: '📌 Key',     text: '<b>Key point:</b> ' },
  { label: '⚠️ Clinic', text: '<b>Clinical:</b> ' },
  { label: '💊 Drug',   text: '<b>Rx:</b> ' },
  { label: '🧠 Mnemo',  text: '<b>Mnemonic:</b> ' },
  { label: '📐 Normal', text: '<b>Normal values:</b> ' },
]

const STORAGE_KEY = 'anatomyai_notes_v2'

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveNotes(notes: Note[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)) } catch {}
}

// ─── Rich-text toolbar button ─────────────────────────────────────────────────
function ToolBtn({
  onClick, active, title, children,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}   // prevent blur
      title={title}
      className={`
        w-6 h-6 rounded flex items-center justify-center text-xs transition-all
        ${active ? 'bg-black/15 shadow-inner' : 'hover:bg-black/10'}
      `}
    >
      {children}
    </button>
  )
}

// ─── Single note card ─────────────────────────────────────────────────────────
function NoteCard({
  note, onDelete, onUpdate,
}: {
  note: Note
  onDelete: (id: string) => void
  onUpdate: (patch: Partial<Note> & { id: string }) => void
}) {
  const [editing, setEditing] = useState(note.html === '')
  const [showFonts, setShowFonts] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [pos, setPos] = useState({ x: note.x, y: note.y })
  const editorRef = useRef<HTMLDivElement>(null)
  const dragging  = useRef(false)
  const dragOff   = useRef({ ox: 0, oy: 0 })

  const col  = NOTE_COLORS.find(c => c.name === note.color) ?? NOTE_COLORS[0]
  const font = FONT_OPTIONS.find(f => f.id === note.font) ?? FONT_OPTIONS[0]

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, [contenteditable]')) return
    dragging.current = true
    dragOff.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({ x: e.clientX - dragOff.current.ox, y: e.clientY - dragOff.current.oy })
    }
    const up = () => {
      if (dragging.current) {
        dragging.current = false
        setPos(p => { onUpdate({ id: note.id, x: p.x, y: p.y }); return p })
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [note.id, onUpdate])

  // ── contenteditable sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== note.html) {
      editorRef.current.innerHTML = note.html
    }
  }, [note.id]) // only on mount / id change

  const saveContent = () => {
    const html = editorRef.current?.innerHTML ?? ''
    onUpdate({ id: note.id, html })
  }

  // ── Format commands ───────────────────────────────────────────────────────
  const fmt = (cmd: string, val?: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(cmd, false, val)
    if (cmd === 'strikeThrough') {
      const selection = window.getSelection()
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
        if (document.queryCommandState('strikeThrough')) {
          document.execCommand('strikeThrough', false)
        }
      }
    }
    saveContent()
  }

  const insertSnippet = (html: string) => {
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, html)
    saveContent()
    setShowSnippets(false)
  }

  const queryFmt = (cmd: string) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, width: 260 }}
    >
      <div
        className="rounded-2xl overflow-hidden shadow-2xl select-none"
        style={{
          background: col.bg,
          border: `1.5px solid ${col.border}55`,
          boxShadow: `0 8px 32px ${col.border}30`,
        }}
      >
        {/* ── Top strip: drag + colour dots + font picker + delete ── */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 cursor-grab active:cursor-grabbing"
          style={{ background: `${col.border}18`, borderBottom: `1px solid ${col.border}30` }}
          onMouseDown={onHeaderMouseDown}
        >
          <GripVertical size={11} style={{ color: col.text, opacity: 0.35 }} className="flex-shrink-0" />

          {/* Colour swatches */}
          {NOTE_COLORS.map(c => (
            <button
              key={c.name}
              onMouseDown={e => { e.stopPropagation(); onUpdate({ id: note.id, color: c.name }) }}
              className="w-3.5 h-3.5 rounded-full border transition-transform hover:scale-125"
              style={{
                background: c.bg,
                borderColor: c.name === note.color ? c.border : `${c.border}55`,
                boxShadow: c.name === note.color ? `0 0 0 1.5px ${c.border}` : 'none',
              }}
            />
          ))}

          <div className="flex-1" />

          {/* Font picker toggle */}
          <button
            onMouseDown={e => { e.stopPropagation(); setShowFonts(v => !v); setShowSnippets(false) }}
            title="Font style"
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold hover:bg-black/10 transition-colors"
            style={{ color: col.text, fontFamily: font.css }}
          >
            Aa
          </button>

          {/* Delete */}
          <button
            onMouseDown={e => { e.stopPropagation(); onDelete(note.id) }}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-black/12 transition-colors"
          >
            <X size={11} style={{ color: col.text, opacity: 0.5 }} />
          </button>
        </div>

        {/* ── Font picker dropdown ── */}
        <AnimatePresence>
          {showFonts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
              style={{ borderBottom: `1px solid ${col.border}25` }}
            >
              <div className="flex gap-1 px-2 py-1.5 flex-wrap" style={{ background: `${col.border}10` }}>
                {FONT_OPTIONS.map(f => (
                  <button
                    key={f.id}
                    onMouseDown={e => { e.preventDefault(); onUpdate({ id: note.id, font: f.id }); setShowFonts(false) }}
                    className="px-2 py-0.5 rounded text-[10px] transition-all hover:bg-black/12"
                    style={{
                      color: col.text,
                      fontFamily: f.css,
                      background: note.font === f.id ? `${col.border}25` : 'transparent',
                      fontWeight: note.font === f.id ? 600 : 400,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Formatting toolbar ── */}
        {editing && (
          <div
            className="flex items-center gap-0.5 px-2 py-1"
            style={{ borderBottom: `1px solid ${col.border}25`, background: `${col.border}08` }}
          >
            <ToolBtn onClick={() => fmt('bold')}       active={queryFmt('bold')}      title="Bold (⌘B)">
              <Bold size={11} style={{ color: col.text }} />
            </ToolBtn>
            <ToolBtn onClick={() => fmt('italic')}     active={queryFmt('italic')}    title="Italic (⌘I)">
              <Italic size={11} style={{ color: col.text }} />
            </ToolBtn>
            <ToolBtn onClick={() => fmt('underline')}  active={queryFmt('underline')} title="Underline (⌘U)">
              <Underline size={11} style={{ color: col.text }} />
            </ToolBtn>

            {/* Highlight: yellow mark */}
            <ToolBtn
              onClick={() => fmt('backColor', '#fde68a')}
              title="Highlight"
            >
              <Highlighter size={11} style={{ color: col.text }} />
            </ToolBtn>

            {/* Strikethrough */}
            <ToolBtn onClick={() => fmt('strikeThrough')} title="Strikethrough">
              <span style={{ color: col.text, fontSize: 10, fontWeight: 700, textDecoration: 'line-through' }}>S</span>
            </ToolBtn>

            <div className="w-px h-3 mx-0.5" style={{ background: `${col.border}40` }} />

            {/* Ordered list */}
            <ToolBtn onClick={() => fmt('insertOrderedList')} title="Numbered list">
              <span style={{ color: col.text, fontSize: 9, fontWeight: 700 }}>1.</span>
            </ToolBtn>
            {/* Unordered list */}
            <ToolBtn onClick={() => fmt('insertUnorderedList')} title="Bullet list">
              <span style={{ color: col.text, fontSize: 12, lineHeight: 1 }}>•</span>
            </ToolBtn>

            <div className="flex-1" />

            {/* Quick-insert snippets toggle */}
            <button
              onMouseDown={e => { e.preventDefault(); setShowSnippets(v => !v) }}
              title="Med-student snippets"
              className="px-1.5 py-0.5 rounded text-[9px] transition-all hover:bg-black/10"
              style={{ color: col.text, fontWeight: 600 }}
            >
              <Tag size={10} style={{ color: col.text }} />
            </button>
          </div>
        )}

        {/* ── Snippet bar ── */}
        <AnimatePresence>
          {editing && showSnippets && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
              style={{ borderBottom: `1px solid ${col.border}25` }}
            >
              <div className="flex flex-wrap gap-1 px-2 py-1" style={{ background: `${col.border}08` }}>
                {QUICK_SNIPPETS.map(s => (
                  <button
                    key={s.label}
                    onMouseDown={e => { e.preventDefault(); insertSnippet(s.text) }}
                    className="px-1.5 py-0.5 rounded text-[9px] hover:bg-black/12 transition-colors whitespace-nowrap"
                    style={{ color: col.text }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content area ── */}
        <div className="relative">
          {/* contenteditable rich editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setEditing(true)}
            onBlur={() => { setEditing(false); setShowSnippets(false); saveContent() }}
            onInput={saveContent}
            onKeyDown={e => {
              if (e.key === 'b' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fmt('bold') }
              if (e.key === 'i' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fmt('italic') }
              if (e.key === 'u' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fmt('underline') }
            }}
            className="note-editor min-h-[72px] px-3 py-2 text-xs leading-relaxed outline-none"
            style={{
              color: col.text,
              fontFamily: font.css,
              caretColor: col.border,
              wordBreak: 'break-word',
            }}
            data-placeholder="Type your notes here…"
          />

          {/* Placeholder when empty */}
          <style>{`
            [data-placeholder]:empty:before {
              content: attr(data-placeholder);
              opacity: 0.38;
              pointer-events: none;
            }
            .note-editor ul {
              list-style: disc;
              padding-left: 1.25rem;
            }
            .note-editor ol {
              list-style: decimal;
              padding-left: 1.25rem;
            }
            .note-editor li {
              display: list-item;
            }
          `}</style>
        </div>

        {/* ── Linked structure tag ── */}
        {note.linkedStructure && (
          <div
            className="flex items-center gap-1 px-3 pb-1.5"
          >
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: `${col.border}22`, color: col.text }}
            >
              📍 {note.linkedStructure}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Manager (toolbar button + note list) ─────────────────────────────────────
export function StickyNotesLayer({ linkedStructure }: { linkedStructure?: string }) {
  const [notes, setNotes]   = useState<Note[]>(loadNotes)
  const [open, setOpen]     = useState(false)
  const [colorIdx, setColorIdx] = useState(0)

  const persist = (next: Note[]) => { setNotes(next); saveNotes(next) }

  const addNote = () => {
    const col = NOTE_COLORS[colorIdx % NOTE_COLORS.length]
    const note: Note = {
      id: `note_${Date.now()}`,
      html: '',
      x: Math.max(20, window.innerWidth / 2 - 130),
      y: Math.max(60, window.innerHeight / 2 - 100),
      color: col.name,
      font: 'sans',
      linkedStructure: linkedStructure ?? undefined,
      createdAt: Date.now(),
    }
    persist([...notes, note])
    setColorIdx(i => i + 1)
    setOpen(false)
  }

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => { const n = prev.filter(x => x.id !== id); saveNotes(n); return n })
  }, [])

  const updateNote = useCallback((patch: Partial<Note> & { id: string }) => {
    setNotes(prev => {
      const n = prev.map(x => x.id === patch.id ? { ...x, ...patch } : x)
      saveNotes(n)
      return n
    })
  }, [])

  return (
    <>
      {/* Toolbar button */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={`
            w-8 h-8 rounded-xl glass border flex items-center justify-center transition-all duration-150
            ${open
              ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300'
              : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
            }
          `}
          title={`Notes (${notes.length})`}
        >
          <StickyNote size={15} />
          {notes.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-yellow-900
              text-[9px] font-bold flex items-center justify-center">
              {notes.length > 9 ? '9+' : notes.length}
            </span>
          )}
        </button>

        {/* Popover */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/10 p-3 shadow-2xl z-50"
              style={{ background: 'rgba(10,14,26,0.96)', backdropFilter: 'blur(14px)' }}
            >
              {/* Colour row */}
              <p className="text-[10px] text-gray-500 mb-2 font-semibold uppercase tracking-wide">Note colour</p>
              <div className="flex gap-2 mb-3">
                {NOTE_COLORS.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => setColorIdx(i)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: c.bg,
                      border: `2px solid ${colorIdx % NOTE_COLORS.length === i ? c.border : 'transparent'}`,
                      boxShadow: colorIdx % NOTE_COLORS.length === i ? `0 0 0 1px ${c.border}` : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Add button */}
              <button
                onClick={addNote}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl
                  bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 text-xs font-bold
                  hover:bg-yellow-400/25 transition-all active:scale-95"
              >
                <Plus size={12} />
                New Note
              </button>

              {/* Notes count + tip */}
              <div className="mt-2.5 text-center">
                {notes.length > 0 ? (
                  <p className="text-[10px] text-gray-600">
                    {notes.length} note{notes.length !== 1 ? 's' : ''} saved · drag to move
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-600">Supports bold, italic, highlight & lists</p>
                )}
              </div>

              {/* Formatting tip */}
              <div className="mt-2 px-2 py-1.5 rounded-lg bg-white/4 border border-white/6">
                <p className="text-[9px] text-gray-500 leading-relaxed">
                  <span className="text-gray-400 font-semibold">⌘B</span> bold ·{' '}
                  <span className="text-gray-400 font-semibold">⌘I</span> italic ·{' '}
                  <span className="text-gray-400 font-semibold">⌘U</span> underline
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* All notes rendered as fixed overlays */}
      <AnimatePresence>
        {notes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            onDelete={deleteNote}
            onUpdate={updateNote}
          />
        ))}
      </AnimatePresence>
    </>
  )
}
