import React, { useState, useEffect, useRef } from 'react'
import { 
  MessageSquare, 
  BarChart3, 
  Database, 
  Cpu, 
  Send, 
  BookOpen, 
  FileText, 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  RefreshCw,
  Compass,
  ChevronsRight,
  TrendingUp,
  Bookmark,
  Terminal,
  Layers,
  Activity,
  ChevronRight,
  Info,
  HelpCircle
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [activeTab, setActiveTab] = useState('chat') // 'chat', 'dashboard', or 'about'
  const [apiOnline, setApiOnline] = useState(false)
  const [checkingApi, setCheckingApi] = useState(true)

  // Chat states
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [selectedSource, setSelectedSource] = useState(null)
  
  // Dashboard states
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [evalStatus, setEvalStatus] = useState({ status: 'IDLE' })
  const [evalLimit, setEvalLimit] = useState(5)
  const [evalModel, setEvalModel] = useState('llama-3.1-8b-instant')
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0)

  // About states
  const [selectedPipelineStep, setSelectedPipelineStep] = useState('ingestion')

  const messagesEndRef = useRef(null)

  // Check API health and Load Stats
  const checkApiHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/evaluation/status`)
      if (res.ok) {
        setApiOnline(true)
        const statusData = await res.json()
        setEvalStatus(statusData)
      } else {
        setApiOnline(false)
      }
    } catch (e) {
      setApiOnline(false)
    } finally {
      setCheckingApi(false)
    }
  }

  const loadStats = async () => {
    setLoadingStats(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/evaluation/stats`)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (e) {
      console.error('Failed to load stats', e)
    } finally {
      setLoadingStats(false)
    }
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    checkApiHealth()
    loadStats()
    
    // Poll API health & status every 5 seconds
    const interval = setInterval(() => {
      checkApiHealth()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Poll evaluation status when it is running
  useEffect(() => {
    let statusInterval
    if (evalStatus.status === 'RUNNING') {
      statusInterval = setInterval(async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/evaluation/status`)
          if (res.ok) {
            const data = await res.json()
            setEvalStatus(data)
            if (data.status !== 'RUNNING') {
              clearInterval(statusInterval)
              loadStats() // Re-load dashboard stats when done
            }
          }
        } catch (e) {
          console.error(e)
        }
      }, 3000)
    }
    return () => {
      if (statusInterval) clearInterval(statusInterval)
    }
  }, [evalStatus.status])

  // Scroll to bottom on new message (only if there are messages or Assistant is running)
  useEffect(() => {
    if (messages.length > 0 || loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  // Handle Send Chat Query
  const handleSend = async (e) => {
    e.preventDefault()
    if (!query.trim() || loading) return

    const userMessage = { role: 'user', text: query }
    setMessages(prev => [...prev, userMessage])
    setQuery('')
    setLoading(true)
    
    // Simulate pipeline step changes to show loading details
    const steps = [
      'Performing hybrid search (FAISS + BM25)...',
      'Merging results with Reciprocal Rank Fusion...',
      'Reranking chunks with Cross-Encoder...',
      'Synthesizing answer using Llama 3.1 8B via Groq...'
    ]
    
    let currentStep = 0
    setLoadingStep(steps[currentStep])
    const stepInterval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++
        setLoadingStep(steps[currentStep])
      }
    }, 1200)

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.text })
      })

      clearInterval(stepInterval)

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          text: data.answer, 
          sources: data.sources 
        }])
        
        // Auto-select first source if available
        if (data.sources && data.sources.length > 0) {
          setSelectedSource(data.sources[0])
        }
      } else {
        const errorData = await res.json()
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          text: `Error: ${errorData.detail || 'Failed to generate answer.'}`, 
          sources: [] 
        }])
      }
    } catch (err) {
      clearInterval(stepInterval)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: 'Failed to connect to backend server. Make sure backend is running on port 8000.', 
        sources: [] 
      }])
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  // Handle Trigger Evaluation Run
  const handleRunEvaluation = async () => {
    if (evalStatus.status === 'RUNNING') return
    try {
      const res = await fetch(`${BACKEND_URL}/api/evaluation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: evalLimit, model: evalModel })
      })
      if (res.ok) {
        const data = await res.json()
        setEvalStatus(data.status)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Formatting AI answer block (removing trailing Sources text since we display sources interactively)
  const cleanAnswer = (text) => {
    let clean = text
    if (clean.includes('Sources:')) {
      clean = clean.split('Sources:')[0].trim()
    } else if (clean.includes('Sources')) {
      clean = clean.split('Sources')[0].trim()
    }
    
    if (clean.startsWith('Answer:')) {
      clean = clean.substring(7).trim()
    }
    return clean
  }

  return (
    <div className="min-h-screen bg-brand-dark text-brand-cream flex flex-col font-sans">
      
      {/* ----------------------------- */}
      {/* HEADER NAVBAR */}
      {/* ----------------------------- */}
      <header className="border-b border-brand-border py-4 px-4 md:py-5 md:px-12 flex flex-col md:flex-row justify-between items-center bg-brand-dark/80 backdrop-blur-md sticky top-0 z-50 gap-4 md:gap-0">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="h-2 w-2 rounded-full bg-brand-accent animate-ping shrink-0" />
            <span className="font-mono text-[10px] sm:text-xs tracking-widest text-brand-accent uppercase shrink-0">[RAGNOVA]</span>
            <h1 className="font-serif text-base sm:text-lg md:text-xl font-semibold select-none tracking-tight font-medium shrink-0">Research RAG</h1>
          </div>
          
          {/* API Connection Indicator for Mobile */}
          <div className="flex md:hidden items-center space-x-2 bg-brand-card px-3 py-1 rounded-full border border-brand-border select-none shrink-0">
            <div className={`h-2 w-2 rounded-full ${apiOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-mono text-[9px] tracking-wider text-brand-muted uppercase">
              {checkingApi ? 'checking...' : apiOnline ? 'api online' : 'api offline'}
            </span>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="flex space-x-1 md:space-x-4 bg-brand-card/60 p-1 rounded-full border border-brand-border w-full md:w-auto justify-center">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-mono transition-all duration-300 ${
              activeTab === 'chat' 
                ? 'bg-brand-accent text-brand-cream' 
                : 'text-brand-muted hover:text-brand-cream'
            }`}
          >
            [01] chat
          </button>
          <button
            onClick={() => {
              setActiveTab('dashboard')
              loadStats()
            }}
            className={`px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-mono transition-all duration-300 ${
              activeTab === 'dashboard' 
                ? 'bg-brand-accent text-brand-cream' 
                : 'text-brand-muted hover:text-brand-cream'
            }`}
          >
            [02] dashboard
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-mono transition-all duration-300 ${
              activeTab === 'about' 
                ? 'bg-brand-accent text-brand-cream' 
                : 'text-brand-muted hover:text-brand-cream'
            }`}
          >
            [03] about
          </button>
        </nav>

        {/* API Connection Indicator for Desktop */}
        <div className="hidden md:flex items-center space-x-2 bg-brand-card px-3 py-1 rounded-full border border-brand-border select-none shrink-0">
          <div className={`h-2 w-2 rounded-full ${apiOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="font-mono text-[10px] tracking-wider text-brand-muted uppercase">
            {checkingApi ? 'checking...' : apiOnline ? 'api online' : 'api offline'}
          </span>
        </div>
      </header>

      {/* ----------------------------- */}
      {/* HERO SECTION */}
      {/* ----------------------------- */}
      <section className="py-8 px-4 md:py-12 md:px-12 max-w-7xl mx-auto w-full border-b border-brand-border/40 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          {activeTab === 'chat' ? (
            <>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal leading-tight font-serif tracking-tight">
                Retrieving knowledge.<br />
                <span className="italic text-brand-accent font-serif font-normal">Answering papers.</span>
              </h2>
              <p className="mt-4 text-brand-muted max-w-lg leading-relaxed text-xs sm:text-sm md:text-base">
                Ask anything about AI research papers. This engine uses a hybrid search pipeline, RRF, and Cross-Encoder reranking to ground response synthesis.
              </p>
            </>
          ) : activeTab === 'dashboard' ? (
            <>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal leading-tight font-serif tracking-tight">
                Evaluating metrics.<br />
                <span className="italic text-brand-accent font-serif font-normal">Benchmarking RAG.</span>
              </h2>
              <p className="mt-4 text-brand-muted max-w-lg leading-relaxed text-xs sm:text-sm md:text-base">
                Inspect accuracy, context recall, context precision, and faithfulness scores assessed through LLM judges in the Ragas framework.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal leading-tight font-serif tracking-tight">
                Understanding design.<br />
                <span className="italic text-brand-accent font-serif font-normal">Exploring RAGNova.</span>
              </h2>
              <p className="mt-4 text-brand-muted max-w-lg leading-relaxed text-xs sm:text-sm md:text-base">
                Discover the architecture, retrieval mechanisms, evaluation framework, and components powering this research assistant.
              </p>
            </>
          )}
        </div>
        
        {/* Monospace Quick Specs */}
        <div className="flex flex-col space-y-2 border-l border-brand-border pl-4 sm:pl-6 py-2">
          {activeTab === 'chat' ? (
            <>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[RETRIEVAL]</span> Vector Search (FAISS) + Keyword (BM25)</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[FUSION]</span> Reciprocal Rank Fusion (RRF)</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[RERANKER]</span> cross-encoder/ms-marco-MiniLM-L-6-v2</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[GENERATOR]</span> llama-3.1-8b-instant (Groq)</div>
            </>
          ) : activeTab === 'dashboard' ? (
            <>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[METRICS]</span> Faithfulness, Relevance, Precision, Recall</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[JUDGE_LLM]</span> Llama 3.3 70B (Groq)</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[DATASET]</span> 14 curated evaluation QA pairs</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[STATUS]</span> {evalStatus.status === 'RUNNING' ? 'Running evaluation in background...' : 'Idle'}</div>
            </>
          ) : (
            <>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[PROJECT]</span> Research RAG & Evaluation Dashboard</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[VERSION]</span> v1.0.0 (Production-Ready)</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[LOCATION]</span> Ahmedabad, India</div>
              <div className="text-[11px] sm:text-xs font-mono"><span className="text-brand-muted">[LICENSE]</span> MIT / Open Source</div>
            </>
          )}
        </div>
      </section>

      {/* ----------------------------- */}
      {/* TAB MAIN CONTENT */}
      {/* ----------------------------- */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12 flex flex-col min-h-[500px]">
        
        {/* ======================================= */}
        {/* TAB 1: CHATBOT INTERFACE */}
        {/* ======================================= */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
            
            {/* Chat Panel (Left 7 cols) */}
            <div className="lg:col-span-7 flex flex-col bg-brand-card rounded-2xl border border-brand-border p-4 md:p-6 shadow-2xl relative min-h-[500px] justify-between">
              
              {/* Message History */}
              <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2 max-h-[500px]">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 mt-12">
                    <Compass className="h-10 w-10 text-brand-accent/60 mb-4 stroke-[1.5]" />
                    <h3 className="font-serif text-lg font-medium text-brand-cream">Start a research dialogue</h3>
                    <p className="text-xs text-brand-muted mt-2 max-w-xs leading-relaxed">
                      Ask technical questions like "Which paper introduced the transformer architecture?" or "What is the main idea behind RAG?"
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
                      <button 
                        onClick={() => setQuery('Which paper introduced the transformer architecture?')}
                        className="text-xs font-mono bg-brand-dark border border-brand-border px-3 py-1.5 rounded-full hover:border-brand-accent hover:text-brand-accent transition-all duration-300"
                      >
                        [Transformer Introduction]
                      </button>
                      <button 
                        onClick={() => setQuery('What is the main idea behind retrieval augmented generation?')}
                        className="text-xs font-mono bg-brand-dark border border-brand-border px-3 py-1.5 rounded-full hover:border-brand-accent hover:text-brand-accent transition-all duration-300"
                      >
                        [What is RAG?]
                      </button>
                      <button 
                        onClick={() => setQuery('What problem does hallucination refer to in language models?')}
                        className="text-xs font-mono bg-brand-dark border border-brand-border px-3 py-1.5 rounded-full hover:border-brand-accent hover:text-brand-accent transition-all duration-300"
                      >
                        [LLM Hallucinations]
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div 
                      key={index}
                      className={`flex flex-col animate-fade-in ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Avatar / Username Label */}
                      <span className="font-mono text-[9px] tracking-wider text-brand-muted uppercase mb-1.5">
                        {msg.role === 'user' ? '[user]' : '[research assistant]'}
                      </span>
                      
                      {/* Message Bubble */}
                      <div 
                        className={`rounded-2xl px-5 py-3.5 max-w-[88%] text-sm leading-relaxed border ${
                          msg.role === 'user' 
                            ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-cream rounded-tr-none' 
                            : 'bg-brand-dark/40 border-brand-border text-brand-cream rounded-tl-none font-serif text-[15px]'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          msg.text
                        ) : (
                          <div>
                            <div className="whitespace-pre-line">{cleanAnswer(msg.text)}</div>
                            
                            {/* Interactive citations list */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-4 pt-3.5 border-t border-brand-border/60">
                                <span className="font-mono text-[9px] tracking-wider text-brand-muted uppercase block mb-2">[referenced sources]</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.sources.map((src, sIdx) => (
                                    <button
                                      key={sIdx}
                                      onClick={() => setSelectedSource(src)}
                                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-mono border transition-all duration-300 ${
                                        selectedSource?.content === src.content
                                          ? 'bg-brand-accent/25 border-brand-accent text-brand-cream font-bold'
                                          : 'bg-brand-dark border-brand-border text-brand-muted hover:text-brand-cream hover:border-brand-muted'
                                      }`}
                                    >
                                      <FileText className="h-3 w-3 inline text-brand-accent" />
                                      <span className="truncate max-w-[120px]">{src.title}</span>
                                      <span className="text-brand-muted/70">(p.{src.page})</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {/* Chat Pipeline Loading Animation */}
                {loading && (
                  <div className="flex flex-col items-start animate-pulse">
                    <span className="font-mono text-[9px] tracking-wider text-brand-muted uppercase mb-1.5">
                      [pipeline compiling]
                    </span>
                    <div className="bg-brand-dark/40 border border-brand-border rounded-2xl rounded-tl-none px-5 py-4 max-w-[80%] flex items-center space-x-3">
                      <Loader2 className="h-4 w-4 text-brand-accent animate-spin" />
                      <span className="font-mono text-xs text-brand-accent">{loadingStep}</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSend} className="relative mt-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading || !apiOnline}
                  placeholder={
                    !apiOnline 
                      ? "API server is offline..." 
                      : loading 
                        ? "Synthesizing answer..." 
                        : "Ask a question about AI papers..."
                  }
                  className="w-full bg-brand-dark border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 rounded-xl px-4 py-3.5 pr-14 text-sm text-brand-cream font-sans placeholder-brand-muted/70 transition-all outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim() || !apiOnline}
                  className="absolute right-2 top-2 p-2 bg-brand-accent/20 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent hover:text-brand-cream disabled:bg-transparent disabled:border-transparent disabled:text-brand-muted rounded-lg transition-all duration-300"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>

            </div>

            {/* Source Citation Inspector Sidebar (Right 5 cols) */}
            <div className="lg:col-span-5 bg-brand-card rounded-2xl border border-brand-border p-6 shadow-2xl flex flex-col min-h-[400px]">
              <div className="flex items-center space-x-2 border-b border-brand-border pb-4 mb-4">
                <Bookmark className="h-4 w-4 text-brand-accent" />
                <h3 className="font-mono text-xs tracking-wider text-brand-cream uppercase">[source citation inspector]</h3>
              </div>
              
              {selectedSource ? (
                <div className="flex-1 flex flex-col justify-between animate-fade-in">
                  <div>
                    {/* Source Title & Header */}
                    <div className="flex items-start space-x-3 mb-4">
                      <div className="p-2 bg-brand-accent/10 border border-brand-accent/20 rounded-lg mt-1 shrink-0">
                        <BookOpen className="h-4 w-4 text-brand-accent" />
                      </div>
                      <div>
                        <h4 className="font-serif text-base font-semibold leading-snug text-brand-cream">
                          {selectedSource.title}
                        </h4>
                        <div className="flex space-x-3 mt-1.5">
                          <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">
                            Page: {selectedSource.page}
                          </span>
                          <span className="font-mono text-[10px] text-brand-muted border border-brand-border px-2 py-0.5 rounded">
                            Reference File
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Source Text Snippet */}
                    <span className="font-mono text-[9px] tracking-wider text-brand-muted uppercase block mb-1.5">[retrieved text chunk]</span>
                    <div className="bg-brand-dark/60 rounded-xl p-4 border border-brand-border text-xs leading-relaxed text-brand-cream font-mono overflow-y-auto max-h-[300px] whitespace-pre-wrap select-text">
                      "{selectedSource.content}"
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-brand-border/60 text-[10px] font-mono text-brand-muted leading-relaxed">
                    💡 This document snippet was selected from the FAISS vector repository and BM25 search corpus using hybrid reciprocal rank fusion.
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-brand-muted">
                  <FileText className="h-8 w-8 text-brand-muted/40 mb-3" />
                  <p className="text-xs max-w-[220px] leading-relaxed">
                    No citation selected. Click a cited paper source button in the chatbot response to load its exact retrieved chunk content.
                  </p>
                </div>
              )}

            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 2: RAGAS EVALUATION DASHBOARD */}
        {/* ======================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-10 animate-fade-in flex-1">
            
            {/* API Offline warning */}
            {!apiOnline && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center space-x-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-brand-cream">Backend Offline:</span> Cannot fetch evaluation results or run Ragas calculations. Please launch the backend server using <code className="bg-brand-dark/60 px-1 rounded">python main.py</code> first.
                </div>
              </div>
            )}

            {/* Status of Background Calculation */}
            {evalStatus.status === 'RUNNING' && (
              <div className="bg-brand-accent/10 border border-brand-accent/30 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-5 w-5 text-brand-accent animate-spin" />
                  <div className="text-xs">
                    <span className="font-bold text-brand-cream font-mono">Ragas Evaluation Running...</span>
                    <p className="text-brand-muted mt-0.5">Llama 3.3 70B is judging the faithfulness, precision, and recall of the RAG pipeline over {evalStatus.limit || 5} questions.</p>
                  </div>
                </div>
                <div className="font-mono text-xs bg-brand-accent/20 border border-brand-accent/30 text-brand-accent px-3 py-1 rounded-full animate-pulse">
                  calculating
                </div>
              </div>
            )}

            {/* Dashboard Stats */}
            {stats && stats.exists ? (
              <div className="space-y-10">
                
                {/* 4 Cards Grid */}
                <div>
                  <h3 className="font-mono text-xs tracking-wider text-brand-muted uppercase mb-4">[average RAG metrics]</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    {/* Metric 1 */}
                    <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[10px] text-brand-muted uppercase">[faithfulness]</span>
                          <Award className="h-4 w-4 text-brand-accent" />
                        </div>
                        <h4 className="text-3xl font-serif mt-2 font-normal">{(stats.faithfulness || 0).toFixed(3)}</h4>
                        <div className="w-full bg-brand-dark h-1.5 rounded-full mt-3 overflow-hidden border border-brand-border/40">
                          <div 
                            className="bg-brand-accent h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(stats.faithfulness || 0) * 100}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-3 leading-relaxed">
                        Measures how grounded the generated answer is in retrieved context, checking for hallucinations.
                      </p>
                    </div>

                    {/* Metric 2 */}
                    <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[10px] text-brand-muted uppercase">[answer relevance]</span>
                          <TrendingUp className="h-4 w-4 text-brand-accent" />
                        </div>
                        <h4 className="text-3xl font-serif mt-2 font-normal">{(stats.answer_relevance || 0).toFixed(3)}</h4>
                        <div className="w-full bg-brand-dark h-1.5 rounded-full mt-3 overflow-hidden border border-brand-border/40">
                          <div 
                            className="bg-brand-accent h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(stats.answer_relevance || 0) * 100}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-3 leading-relaxed">
                        Measures how relevant the generated response is to the user's initial question.
                      </p>
                    </div>

                    {/* Metric 3 */}
                    <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[10px] text-brand-muted uppercase">[context precision]</span>
                          <Database className="h-4 w-4 text-brand-accent" />
                        </div>
                        <h4 className="text-3xl font-serif mt-2 font-normal">{(stats.context_precision || 0).toFixed(3)}</h4>
                        <div className="w-full bg-brand-dark h-1.5 rounded-full mt-3 overflow-hidden border border-brand-border/40">
                          <div 
                            className="bg-brand-accent h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(stats.context_precision || 0) * 100}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-3 leading-relaxed">
                        Measures whether relevant items are prioritized at the top of retrieved search chunks.
                      </p>
                    </div>

                    {/* Metric 4 */}
                    <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-[10px] text-brand-muted uppercase">[context recall]</span>
                          <Cpu className="h-4 w-4 text-brand-accent" />
                        </div>
                        <h4 className="text-3xl font-serif mt-2 font-normal">{(stats.context_recall || 0).toFixed(3)}</h4>
                        <div className="w-full bg-brand-dark h-1.5 rounded-full mt-3 overflow-hidden border border-brand-border/40">
                          <div 
                            className="bg-brand-accent h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(stats.context_recall || 0) * 100}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-brand-muted mt-3 leading-relaxed">
                        Measures whether the RAG pipeline is retrieving the full scope of necessary source details.
                      </p>
                    </div>

                  </div>
                </div>

                {/* Inspect QA Pairs Inspector */}
                <div className="bg-brand-card rounded-2xl border border-brand-border p-6 shadow-2xl">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-brand-border pb-4 mb-6 gap-4">
                    <div>
                      <h3 className="font-serif text-lg font-semibold text-brand-cream">🔍 Inspect QA Pairs & Metrics</h3>
                      <p className="text-xs text-brand-muted">Select a question to inspect its detailed evaluation metrics and retrieved context.</p>
                    </div>
                    
                    {/* Question dropdown Selector */}
                    {stats.per_question && stats.per_question.length > 0 && (
                      <select
                        value={selectedQuestionIdx}
                        onChange={(e) => setSelectedQuestionIdx(Number(e.target.value))}
                        className="bg-brand-dark border border-brand-border rounded-xl px-4 py-2 text-xs text-brand-cream focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 outline-none max-w-sm w-full font-mono cursor-pointer"
                      >
                        {stats.per_question.map((q, idx) => (
                          <option key={idx} value={idx}>
                            Q{idx+1}: {(q.user_input || q.question || '').substring(0, 45)}...
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {stats.per_question && stats.per_question[selectedQuestionIdx] && (
                    <div className="space-y-6 animate-fade-in text-sm">
                      
                      {/* Full Question Text */}
                      <div className="bg-brand-dark/40 border border-brand-border p-4 rounded-xl">
                        <span className="font-mono text-[9px] text-brand-accent uppercase block mb-1">[question]</span>
                        <h4 className="font-serif text-base text-brand-cream leading-relaxed font-semibold">
                          {stats.per_question[selectedQuestionIdx].user_input || stats.per_question[selectedQuestionIdx].question}
                        </h4>
                      </div>

                      {/* Side by side Answer & Reference */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Generated Answer */}
                        <div className="bg-brand-dark/20 border border-brand-border p-4 rounded-xl">
                          <span className="font-mono text-[9px] text-brand-muted uppercase block mb-2">[generated RAG answer]</span>
                          <p className="text-xs text-brand-cream leading-relaxed whitespace-pre-line font-serif italic text-brand-cream/90">
                            {cleanAnswer(stats.per_question[selectedQuestionIdx].response || stats.per_question[selectedQuestionIdx].answer || '')}
                          </p>
                        </div>

                        {/* Ground Truth Reference */}
                        <div className="bg-brand-dark/20 border border-brand-border p-4 rounded-xl">
                          <span className="font-mono text-[9px] text-brand-muted uppercase block mb-2">[ground truth reference]</span>
                          <p className="text-xs text-brand-muted leading-relaxed whitespace-pre-line font-serif">
                            {stats.per_question[selectedQuestionIdx].reference || stats.per_question[selectedQuestionIdx].ground_truth}
                          </p>
                        </div>

                      </div>

                      {/* Question Specific Metrics */}
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-3">[individual evaluation scores]</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          
                          <div className="bg-brand-dark/50 border border-brand-border p-3 rounded-lg text-center">
                            <span className="text-[10px] font-mono text-brand-muted block">Faithfulness</span>
                            <span className="text-base font-serif font-bold text-brand-cream">
                              {(stats.per_question[selectedQuestionIdx].faithfulness ?? 0.0).toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-brand-dark/50 border border-brand-border p-3 rounded-lg text-center">
                            <span className="text-[10px] font-mono text-brand-muted block">Relevance</span>
                            <span className="text-base font-serif font-bold text-brand-cream">
                              {(stats.per_question[selectedQuestionIdx].answer_relevancy ?? stats.per_question[selectedQuestionIdx].answer_relevance ?? 0.0).toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-brand-dark/50 border border-brand-border p-3 rounded-lg text-center">
                            <span className="text-[10px] font-mono text-brand-muted block">Precision</span>
                            <span className="text-base font-serif font-bold text-brand-cream">
                              {(stats.per_question[selectedQuestionIdx].context_precision ?? 0.0).toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-brand-dark/50 border border-brand-border p-3 rounded-lg text-center">
                            <span className="text-[10px] font-mono text-brand-muted block">Recall</span>
                            <span className="text-base font-serif font-bold text-brand-cream">
                              {(stats.per_question[selectedQuestionIdx].context_recall ?? 0.0).toFixed(2)}
                            </span>
                          </div>

                        </div>
                      </div>

                      {/* Retrieved Context Chunks list */}
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-3">[retrieved context chunks evaluated]</span>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {(stats.per_question[selectedQuestionIdx].retrieved_contexts || stats.per_question[selectedQuestionIdx].contexts || []).map((ctx, cIdx) => (
                            <div key={cIdx} className="bg-brand-dark/60 border border-brand-border/60 p-3.5 rounded-lg text-xs leading-relaxed font-mono">
                              <div className="text-[9px] text-brand-accent uppercase mb-1 font-bold">Chunk {cIdx+1}</div>
                              "{ctx}"
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}

                </div>

              </div>
            ) : (
              <div className="bg-brand-card rounded-2xl border border-brand-border p-12 text-center shadow-xl max-w-xl mx-auto">
                <AlertCircle className="h-10 w-10 text-brand-accent/70 mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold text-brand-cream">No evaluation stats found</h3>
                <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                  Evaluation results file <code className="bg-brand-dark px-1.5 py-0.5 rounded font-mono">ragas_evaluation_results.json</code> was not found or is empty. Trigger a new Ragas evaluation run to calculate stats.
                </p>
              </div>
            )}

            {/* Run New Evaluation Trigger panel */}
            <div className="bg-brand-card rounded-2xl border border-brand-border p-6 shadow-2xl max-w-2xl mx-auto">
              <div className="flex items-center space-x-2 border-b border-brand-border pb-3 mb-5">
                <RefreshCw className="h-4 w-4 text-brand-accent" />
                <h3 className="font-serif text-base font-semibold text-brand-cream">Run Pipeline Evaluation</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-[10px] font-mono text-brand-muted uppercase mb-1.5">Question Limit</label>
                  <input
                    type="number"
                    value={evalLimit}
                    min="1"
                    max="50"
                    onChange={(e) => setEvalLimit(Number(e.target.value))}
                    disabled={evalStatus.status === 'RUNNING' || !apiOnline}
                    className="w-full bg-brand-dark border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 rounded-xl px-4 py-2.5 text-xs text-brand-cream outline-none font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-mono text-brand-muted uppercase mb-1.5">Judge model (Groq)</label>
                  <select
                    value={evalModel}
                    onChange={(e) => setEvalModel(e.target.value)}
                    disabled={evalStatus.status === 'RUNNING' || !apiOnline}
                    className="w-full bg-brand-dark border border-brand-border focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 rounded-xl px-4 py-2.5 text-xs text-brand-cream outline-none font-mono cursor-pointer"
                  >
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fast / Light)</option>
                    <option value="llama-3.3-70b-specdec">llama-3.3-70b-specdec (High Precision)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunEvaluation}
                disabled={evalStatus.status === 'RUNNING' || !apiOnline}
                className="w-full bg-brand-accent border border-brand-accent text-brand-cream hover:bg-transparent hover:text-brand-accent disabled:bg-brand-border disabled:border-brand-border disabled:text-brand-muted px-4 py-3 rounded-xl text-xs font-mono font-bold tracking-wider transition-all duration-300 uppercase"
              >
                {evalStatus.status === 'RUNNING' ? 'Evaluation currently running...' : 'Trigger ragas evaluation run'}
              </button>
            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 3: ABOUT / ARCHITECTURE SECTION */}
        {/* ======================================= */}
        {activeTab === 'about' && (
          <div className="space-y-12 animate-fade-in flex-1">
            
            {/* Grid for Introduction and System Specs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              
              {/* Introduction Card (Left 7 cols) */}
              <div className="lg:col-span-7 bg-brand-card rounded-2xl border border-brand-border p-6 md:p-8 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center space-x-2.5 mb-4">
                    <Info className="h-5 w-5 text-brand-accent" />
                    <h3 className="font-mono text-xs tracking-wider text-brand-cream uppercase">[project overview]</h3>
                  </div>
                  <h4 className="font-serif text-2xl font-semibold mb-4 leading-snug">
                    RAGNova is an academic-grade Retrieval-Augmented Generation platform built to converse with research literature.
                  </h4>
                  <p className="text-sm text-brand-muted leading-relaxed mb-6">
                    Designed as a research assistant, this project addresses the limitations of standard Large Language Models (LLMs)—namely, time-cutoff and lack of specialized domain knowledge—by grounding generation strictly within a curated database of AI publications.
                  </p>
                  <p className="text-sm text-brand-muted leading-relaxed">
                    By fusing dense semantic embeddings with sparse keyword match indices, we ensure relevant retrieval even for precise terminology. A downstream Cross-Encoder model re-ranks the candidate chunks, minimizing the prompt context size and maximizing synthesizing faithfulness.
                  </p>
                </div>
                
                <div className="mt-8 pt-6 border-t border-brand-border/40 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center font-mono text-xs text-brand-accent font-bold">
                      R
                    </div>
                    <span className="font-mono text-xs text-brand-cream font-medium tracking-wide">RAGNova Research Lab</span>
                  </div>
                  <span className="font-mono text-[10px] text-brand-muted">[BUILD: 2026.06.20]</span>
                </div>
              </div>

              {/* Quick Pipeline Status / Overview Card (Right 5 cols) */}
              <div className="lg:col-span-5 bg-brand-card rounded-2xl border border-brand-border p-6 md:p-8 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center space-x-2.5 mb-5 border-b border-brand-border/60 pb-3">
                    <Activity className="h-4 w-4 text-brand-accent animate-pulse" />
                    <h3 className="font-mono text-xs tracking-wider text-brand-cream uppercase">[pipeline specification]</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
                      <span className="text-xs text-brand-muted font-mono">Dense Vector Model</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">BGE-Large-En-v1.5</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
                      <span className="text-xs text-brand-muted font-mono">Sparse Keyword Rank</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">BM25 Okapi</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
                      <span className="text-xs text-brand-muted font-mono">Rank Fusion Algorithm</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">Reciprocal Rank Fusion</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
                      <span className="text-xs text-brand-muted font-mono">Reranking Model</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">ms-marco-MiniLM-L-6-v2</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-brand-border/40 pb-2.5">
                      <span className="text-xs text-brand-muted font-mono">Generative LLM (Groq)</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">Llama 3.1 8B</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-brand-muted font-mono">Evaluation LLM (Groq)</span>
                      <span className="text-xs text-brand-cream font-mono font-medium">Llama 3.3 70B</span>
                    </div>
                  </div>
                </div>

                <div className="bg-brand-dark/40 border border-brand-border rounded-xl p-3.5 mt-6 flex items-center space-x-3">
                  <Terminal className="h-4 w-4 text-brand-accent" />
                  <span className="font-mono text-[10px] text-brand-muted leading-relaxed">
                    FastAPI serves endpoints on <code className="bg-brand-dark px-1 py-0.5 rounded text-brand-accent">:8000</code> with CORS configuration.
                  </span>
                </div>
              </div>

            </div>

            {/* Interactive Architecture Workflow Section */}
            <div className="bg-brand-card rounded-2xl border border-brand-border p-6 md:p-8 shadow-xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-brand-border pb-4 mb-6 gap-4">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-brand-cream">⚙️ Interactive Pipeline Architecture</h3>
                  <p className="text-xs text-brand-muted">Click the stages below to inspect their operational mechanisms, inputs, outputs, and details.</p>
                </div>
              </div>
              
              {/* Horizontal Pipeline Steps Selector */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                {[
                  { id: 'ingestion', label: '1. Ingestion', icon: Database },
                  { id: 'retrieval', label: '2. Hybrid Search', icon: Compass },
                  { id: 'rerank', label: '3. Reranking', icon: Layers },
                  { id: 'generation', label: '4. Generation', icon: Cpu },
                  { id: 'evaluation', label: '5. Evaluation', icon: Award },
                ].map((step) => {
                  const StepIcon = step.icon
                  const isSelected = selectedPipelineStep === step.id
                  return (
                    <button
                      key={step.id}
                      onClick={() => setSelectedPipelineStep(step.id)}
                      className={`flex items-center space-x-2.5 px-4 py-3 rounded-xl border text-xs font-mono transition-all duration-300 ${
                        isSelected 
                          ? 'bg-brand-accent/20 border-brand-accent text-brand-cream font-bold shadow-[0_0_15px_rgba(217,119,54,0.15)]' 
                          : 'bg-brand-dark/40 border-brand-border text-brand-muted hover:border-brand-muted hover:text-brand-cream'
                      }`}
                    >
                      <StepIcon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-brand-accent' : 'text-brand-muted'}`} />
                      <span className="truncate">{step.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Step Details Display */}
              <div className="bg-brand-dark/60 border border-brand-border rounded-xl p-5 md:p-6 min-h-[250px] flex flex-col justify-between animate-fade-in">
                {selectedPipelineStep === 'ingestion' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded uppercase">Stage 01</span>
                        <h4 className="font-serif text-lg font-semibold text-brand-cream mt-2">Data Extraction & Chunking</h4>
                      </div>
                      <span className="font-mono text-[10px] text-brand-muted uppercase bg-brand-card border border-brand-border px-2 py-0.5 rounded">offline process</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed max-w-3xl">
                      The pipeline starts by loading research PDF files using `PyMuPDFLoader` (which preserves layout coordinates and pages). 
                      The text is processed using `RecursiveCharacterTextSplitter` configured with a chunk size of <code className="bg-brand-dark px-1.5 py-0.5 rounded text-brand-cream">1000 characters</code> and a chunk overlap of <code className="bg-brand-dark px-1.5 py-0.5 rounded text-brand-cream">200 characters</code>.
                      This ensures semantic units (sentences/paragraphs) aren't split mid-thought and critical context is preserved.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border/40">
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[inputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Academic Research PDFs (in /backend/data)</span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[outputs]</span>
                        <span className="text-xs text-brand-cream font-mono">chunks.json (Metadata: Page, Title, Text content)</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedPipelineStep === 'retrieval' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded uppercase">Stage 02</span>
                        <h4 className="font-serif text-lg font-semibold text-brand-cream mt-2">Hybrid Dense-Sparse Search & Reciprocal Rank Fusion</h4>
                      </div>
                      <span className="font-mono text-[10px] text-brand-accent uppercase bg-brand-card border border-brand-border/60 px-2 py-0.5 rounded">real-time</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed max-w-3xl">
                      To achieve robust retrieval, we combine two paradigms:
                      <br />
                      1. **Dense Vector Search (FAISS)**: Encodes queries using `BAAI/bge-large-en-v1.5` embeddings to retrieve the top 20 chunks based on cosine similarity, capturing deeper abstract meanings.
                      <br />
                      2. **Sparse Keyword Search (BM25)**: Evaluates vocabulary frequencies to find the top 20 chunks containing precise keyword hits (like model names or specific scores).
                      <br />
                      We fuse both lists using **Reciprocal Rank Fusion (RRF)** to calculate a combined relevance ranking score.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border/40">
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[inputs]</span>
                        <span className="text-xs text-brand-cream font-mono">User NLP Query (String)</span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[outputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Merged list of 40 candidate chunks</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedPipelineStep === 'rerank' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded uppercase">Stage 03</span>
                        <h4 className="font-serif text-lg font-semibold text-brand-cream mt-2">Cross-Encoder Re-Ranking</h4>
                      </div>
                      <span className="font-mono text-[10px] text-brand-accent uppercase bg-brand-card border border-brand-border/60 px-2 py-0.5 rounded">real-time</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed max-w-3xl">
                      While RRF is highly effective, it relies purely on separate rank comparisons. We pass the candidate chunks through a secondary reranker using `ms-marco-MiniLM-L-6-v2`.
                      The Cross-Encoder processes the user's query and chunk content *simultaneously* via joint self-attention, generating an exact compatibility score.
                      This yields highly accurate context ranking, allowing us to select only the top-5 chunks, which minimizes context token usage and avoids LLM attention distraction.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border/40">
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[inputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Merged Chunks List + Original Query</span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[outputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Top-5 highly relevant, re-ranked context chunks</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedPipelineStep === 'generation' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded uppercase">Stage 04</span>
                        <h4 className="font-serif text-lg font-semibold text-brand-cream mt-2">Contextual Synthesis & Citation Mapping</h4>
                      </div>
                      <span className="font-mono text-[10px] text-brand-accent uppercase bg-brand-card border border-brand-border/60 px-2 py-0.5 rounded">real-time</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed max-w-3xl">
                      The top-5 re-ranked chunks are injected into a system prompt for the `llama-3.1-8b-instant` model hosted on Groq for ultra-low latency generation.
                      The model is instructed to synthesize a highly detailed response *only* using the provided contexts. If the context does not contain the answer, it declines.
                      Each chunk is passed alongside its original metadata (PDF title, page number), which is returned to the frontend.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border/40">
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[inputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Prompt containing Top-5 contexts + Query</span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[outputs]</span>
                        <span className="text-xs text-brand-cream font-mono">Synthesized response string + Source citation pills</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedPipelineStep === 'evaluation' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-0.5 rounded uppercase">Stage 05</span>
                        <h4 className="font-serif text-lg font-semibold text-brand-cream mt-2">Continuous Benchmarking & Ragas Evaluation</h4>
                      </div>
                      <span className="font-mono text-[10px] text-brand-muted uppercase bg-brand-card border border-brand-border px-2 py-0.5 rounded">asynchronous / background</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed max-w-3xl">
                      To ensure system quality, developers can trigger an asynchronous pipeline benchmark run from the dashboard.
                      RAGNova runs a set of curated, hand-labeled evaluation questions (`eval_questions.json`) containing human-authored questions and ground-truth answers.
                      The resulting inputs, retrieved contexts, and generated answers are passed to a high-capacity LLM judge (`llama-3.3-70b-specdec` via Groq) to compute four distinct Ragas accuracy metrics.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border/40">
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[inputs]</span>
                        <span className="text-xs text-brand-cream font-mono">QA Benchmark datasets + Evaluation pipeline settings</span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] text-brand-muted uppercase block mb-1">[outputs]</span>
                        <span className="text-xs text-brand-cream font-mono">ragas_evaluation_results.json (Dashboard statistics)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Evaluation Metrics Glossary Grid */}
            <div>
              <h3 className="font-mono text-xs tracking-wider text-brand-muted uppercase mb-4">[ragas evaluation metrics glossary]</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Metric 1 */}
                <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">[faithfulness]</span>
                      <Award className="h-4.5 w-4.5 text-brand-accent" />
                    </div>
                    <h4 className="text-lg font-serif mt-3 font-semibold text-brand-cream">Faithfulness Score</h4>
                    <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                      Measures whether the generated answer is strictly grounded in the retrieved context chunks. The LLM judge extracts claims from the answer and checks if they are mathematically supported by the retrieved contexts.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-brand-border/40 text-[10px] font-mono text-brand-muted">
                    💡 High faithfulness means zero hallucinations.
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">[answer relevance]</span>
                      <TrendingUp className="h-4.5 w-4.5 text-brand-accent" />
                    </div>
                    <h4 className="text-lg font-serif mt-3 font-semibold text-brand-cream">Answer Relevance</h4>
                    <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                      Evaluates whether the generated response directly answers the user's initial question. The LLM judge generates multiple queries based on the generated answer and checks their similarity to the original question.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-brand-border/40 text-[10px] font-mono text-brand-muted">
                    💡 Avoids verbose, off-topic, or copy-pasted details.
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">[context precision]</span>
                      <Database className="h-4.5 w-4.5 text-brand-accent" />
                    </div>
                    <h4 className="text-lg font-serif mt-3 font-semibold text-brand-cream">Context Precision</h4>
                    <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                      Measures whether the search pipeline ranks the most relevant reference chunks at the top of the search output list. This prevents the LLM from getting distracted by lower-quality texts.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-brand-border/40 text-[10px] font-mono text-brand-muted">
                    💡 Validates the search and cross-encoder ranking.
                  </div>
                </div>

                {/* Metric 4 */}
                <div className="bg-brand-card rounded-2xl border border-brand-border p-5 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded">[context recall]</span>
                      <Cpu className="h-4.5 w-4.5 text-brand-accent" />
                    </div>
                    <h4 className="text-lg font-serif mt-3 font-semibold text-brand-cream">Context Recall</h4>
                    <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                      Measures whether all facts in the human-authored ground truth reference are successfully present in the retrieved chunks. High recall ensures the LLM has all the pieces of the puzzle before speaking.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-brand-border/40 text-[10px] font-mono text-brand-muted">
                    💡 Ensures complete information answers the query.
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>

      {/* ----------------------------- */}
      {/* FOOTER */}
      {/* ----------------------------- */}
      <footer className="border-t border-brand-border/40 py-8 px-6 mt-12 text-center bg-brand-dark/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-brand-muted uppercase tracking-wider">
          <div>[BUILD] RAGNova System</div>
          <div>Ahmedabad, India</div>
          <div>Index 2026</div>
        </div>
      </footer>

    </div>
  )
}

export default App
