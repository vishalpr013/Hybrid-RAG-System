# 📚 Research RAG Chatbot & Evaluation Dashboard

A restructured, production-ready **Retrieval-Augmented Generation (RAG)** system that lets you chat with AI research papers. Built with a **FastAPI backend** and a beautiful, high-fidelity **React frontend** styled to match custom dark serif & monospace portfolio themes.

---

## 🚀 Features

- **Hybrid Retrieval**: Integrates vector search (FAISS) + keyword search (BM25) fused via Reciprocal Rank Fusion (RRF).
- **Reranking**: Scores and prioritizes top documents using a Cross-Encoder (`ms-marco-MiniLM-L-6-v2`).
- **Citation Tracking**: Fully traceable chatbot answers with interactive clickable source reference pills showing exact chunk text.
- **Ragas Dashboard**: Visualizes faithfulness, answer relevance, context precision, and context recall computed using LLM judges.
- **Background Evaluations**: Run pipeline evaluations on hand-crafted QA pairs asynchronously from the dashboard UI.

---

## 🏗️ Folder Structure

```
research-rag-chatbot/
├── backend/
│   ├── data/                 # PDF papers and definitions
│   ├── faiss_index/          # Built FAISS vector index
│   ├── main.py               # FastAPI server & lazy loaders
│   ├── build_index.py        # Index building pipeline
│   ├── evaluate_ragas.py     # Ragas evaluation executor
│   ├── eval_questions.json   # Evaluation Q&A benchmark questions
│   ├── ragas_evaluation_results.json # Latest Ragas scoring results
│   └── requirements.txt      # Backend Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main React UI (Chat + Dashboard tabs)
│   │   ├── index.css         # Tailwind directives & design tokens
│   │   └── main.jsx
│   ├── tailwind.config.js    # Tailwind configuration & custom theme
│   ├── package.json          # Frontend dependencies
│   └── index.html
├── notebook/                 # Notebooks folder
│   └── rag_pipeline_experiments.ipynb
├── .env                      # API keys (GROQ_API_KEY)
├── .gitignore
└── README.md
```

---

## ⚙️ Getting Started

### 1. Set Up Environment Variables
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key_here
```

### 2. Run the Backend (FastAPI)
Navigate to the backend, set up a virtual environment, install requirements, and run the server:
```bash
# Navigate to backend
cd backend

# Create virtual env and activate it
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI
python main.py
```
The API server will run at `http://localhost:8000`.

### 3. Run the Frontend (React + Vite)
In a new terminal window, navigate to the frontend, install npm modules, and run the development server:
```bash
# Navigate to frontend
cd frontend

# Install Node modules
npm install

# Start Vite dev server
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🧠 Tech Stack

| Layer | Tool / Model |
|---|---|
| **Frontend** | React JSX, Tailwind CSS v3, Lucide Icons, Vite |
| **Backend API** | FastAPI, Uvicorn, Python |
| **PDF Loading & Splitting** | `PyMuPDFLoader`, `RecursiveCharacterTextSplitter` |
| **Embeddings** | `BAAI/bge-large-en-v1.5` (normalize_embeddings=True) |
| **Vector DB** | `FAISS` |
| **Sparse Retrieval** | `BM25Okapi` (rank-bm25) |
| **Reranker** | `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| **Generator LLM** | `llama-3.1-8b-instant` via **Groq API** |
| **LLM Judge** | `llama-3.3-70b-specdec` via **Groq API** (Ragas) |
| **Framework** | LangChain Core, Datasets, Ragas |

---

## 📊 Ragas Evaluation Metrics

The system uses the Ragas framework to evaluate pipeline performance across 4 critical aspects:
1. **Faithfulness**: Validates whether the generated answer is strictly grounded in retrieved contexts (detecting hallucination).
2. **Answer Relevance**: Checks whether the generated response addresses the user's initial question.
3. **Context Precision**: Determines if the most relevant chunks are retrieved at the top of the search list.
4. **Context Recall**: Measures whether all ground truth details are successfully present in retrieved contexts.
