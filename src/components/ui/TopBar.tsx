import { motion } from 'framer-motion'
import {
  Activity, BookOpen, Stethoscope, HelpCircle,
  RotateCcw, Mic, MicOff, Scissors, Brain, ChevronDown
} from 'lucide-react'
import { useState } from 'react'
import { useAnatomyStore, type AppMode } from '../../store/anatomyStore'
import { LessonPicker } from '../modes/TeachMode'
import { ScenarioPicker } from '../modes/ClinicalMode'
import { StickyNotesLayer } from './StickyNotes'

const MODES: { id: AppMode; label: string; icon: any; color: string; activeColor: string }[] = [
  { id: 'explore', label: 'Explore', icon: Activity, color: 'text-gray-400', activeColor: 'text-cyan-400' },
  { id: 'dissection', label: 'Dissect', icon: Scissors, color: 'text-gray-400', activeColor: 'text-orange-400' },
  { id: 'teach', label: 'Teach Me', icon: BookOpen, color: 'text-gray-400', activeColor: 'text-blue-400' },
  { id: 'clinical', label: 'Clinical', icon: Stethoscope, color: 'text-gray-400', activeColor: 'text-green-400' },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle, color: 'text-gray-400', activeColor: 'text-purple-400' },
]

const MODE_ACTIVE_BG: Record<AppMode, string> = {
  explore: 'bg-cyan-500/15 border-cyan-500/30',
  dissection: 'bg-orange-500/15 border-orange-500/30',
  teach: 'bg-blue-500/15 border-blue-500/30',
  clinical: 'bg-green-500/15 border-green-500/30',
  quiz: 'bg-purple-500/15 border-purple-500/30',
}

export function TopBar() {
  const {
    appMode, setAppMode, startQuiz,
    isListening, setListening, addMessage,
    setPendingVoiceCommand, selectedStructure,
  } = useAnatomyStore()

  const [showTeachPicker, setShowTeachPicker] = useState(false)
  const [showClinicalPicker, setShowClinicalPicker] = useState(false)

  const handleModeClick = (mode: AppMode) => {
    if (mode === 'teach') {
      setShowTeachPicker(!showTeachPicker)
      setShowClinicalPicker(false)
      return
    }
    if (mode === 'clinical') {
      setShowClinicalPicker(!showClinicalPicker)
      setShowTeachPicker(false)
      return
    }
    if (mode === 'quiz') {
      setAppMode('quiz')
      startQuiz()
      addMessage({
        role: 'ai',
        content: `🧠 **Quiz Mode** — Labels are hidden. Click the structure that matches the hint!`,
      })
      return
    }
    setAppMode(mode)
    setShowTeachPicker(false)
    setShowClinicalPicker(false)
  }

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    setListening(true)
    recognition.start()
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      setListening(false)
      // Route through AIChatPanel's full handleSend pipeline
      setPendingVoiceCommand(text)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend  = () => setListening(false)
  }

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-30 px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass border border-cyan-500/20">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Brain size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">AnatomyAI</span>
            <span className="text-xs text-gray-500 hidden sm:block">Upper Limb</span>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="flex items-center gap-1 glass rounded-2xl p-1 border border-white/8">
          {MODES.map(mode => {
            const Icon = mode.icon
            const isActive = appMode === mode.id
            return (
              <div key={mode.id} className="relative">
                <button
                  onClick={() => handleModeClick(mode.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                    transition-all duration-200 border
                    ${isActive
                      ? `${MODE_ACTIVE_BG[mode.id]} ${mode.activeColor}`
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }
                  `}
                >
                  <Icon size={13} />
                  <span className="hidden sm:block">{mode.label}</span>
                  {(mode.id === 'teach' || mode.id === 'clinical') && (
                    <ChevronDown size={10} className="hidden sm:block" />
                  )}
                </button>

                {/* Teach picker dropdown */}
                {mode.id === 'teach' && showTeachPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 glass rounded-xl border border-white/10 p-2 shadow-xl z-50"
                  >
                    <LessonPicker onClose={() => setShowTeachPicker(false)} />
                  </motion.div>
                )}

                {/* Clinical picker dropdown */}
                {mode.id === 'clinical' && showClinicalPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 glass rounded-xl border border-white/10 p-2 shadow-xl z-50"
                  >
                    <ScenarioPicker onClose={() => setShowClinicalPicker(false)} />
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Voice */}
          <button
            onClick={handleVoice}
            className={`
              w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-150
              ${isListening
                ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                : 'glass border-white/10 text-gray-400 hover:text-white hover:border-white/20'
              }
            `}
            title="Voice command"
          >
            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>

          {/* Reset — full anatomy reset (preserves notes/progress/chat) */}
          <button
            onClick={() => useAnatomyStore.getState().fullReset()}
            className="w-8 h-8 rounded-xl glass border border-white/10 text-gray-400
              hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
            title="Reset view — restores all structures, clears highlights, resets camera"
          >
            <RotateCcw size={14} />
          </button>

          {/* Sticky Notes */}
          <StickyNotesLayer linkedStructure={selectedStructure?.name} />
        </div>
      </div>

      {/* Backdrop for pickers */}
      {(showTeachPicker || showClinicalPicker) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setShowTeachPicker(false); setShowClinicalPicker(false) }}
        />
      )}
    </>
  )
}
