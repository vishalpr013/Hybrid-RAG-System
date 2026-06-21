import pyarrow.dataset  # Fix Windows access violation DLL conflict with PyTorch/CUDA
import torch
import os
import re
import json
import subprocess
import datetime
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder

from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

# -----------------------------
# PATHS AND ENV
# -----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
faiss_path = os.path.join(BASE_DIR, "faiss_index")
chunks_path = os.path.join(BASE_DIR, "chunks.json")
eval_results_path = os.path.join(BASE_DIR, "ragas_evaluation_results.json")
eval_questions_path = os.path.join(BASE_DIR, "eval_questions.json")

# Load environment variables
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

device = "cuda" if torch.cuda.is_available() else "cpu"

# -----------------------------
# LAZY MODEL LOADING
# -----------------------------
db = None
bm25 = None
chunks_data = None
reranker = None
chain = None

def get_db():
    global db
    if db is None:
        print("[BACKEND] Loading FAISS index...")
        embedding_model = HuggingFaceEmbeddings(
            model_name="BAAI/bge-large-en-v1.5",
            model_kwargs={"device": device},
            encode_kwargs={"normalize_embeddings": True}
        )
        db = FAISS.load_local(
            faiss_path,
            embedding_model,
            allow_dangerous_deserialization=True
        )
    return db

def get_bm25():
    global bm25, chunks_data
    if bm25 is None or chunks_data is None:
        print("[BACKEND] Loading chunks.json and BM25 index...")
        with open(chunks_path, "r", encoding="utf-8") as f:
            chunks_data = json.load(f)
        chunks = [c["content"] for c in chunks_data]
        def tokenize(text):
            return re.findall(r"\w+", text.lower())
        bm25_corpus = [tokenize(c) for c in chunks]
        bm25 = BM25Okapi(bm25_corpus)
    return bm25, chunks_data

def get_reranker():
    global reranker
    if reranker is None:
        print("[BACKEND] Loading CrossEncoder reranker...")
        reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", device=device)
    return reranker

def get_llm():
    global chain
    if chain is None:
        print("[BACKEND] Loading ChatGroq LLM...")
        llm = ChatGroq(
            groq_api_key=GROQ_API_KEY,
            model_name="llama-3.1-8b-instant",
            temperature=0.0
        )
        prompt = PromptTemplate.from_template("""
You are a research assistant.

Answer the question factually using the provided context. 
If the answer cannot be derived from the context, respond with "Not found in provided papers."
Avoid making up information or referencing facts outside the context, but you may use logical reasoning based on the context to link facts.

Context:
{context}

Question:
{question}

Return:

Answer:
<explanation>

Sources:
- Paper: <paper title> | Page: <page number>
""")
        chain = prompt | llm | StrOutputParser()
    return chain

# -----------------------------
# RETRIEVAL LOGIC
# -----------------------------
def tokenize(text):
    return re.findall(r"\w+", text.lower())

def hybrid_retrieval(query, k_vector=80, k_bm25=80, rrf_k=30, top_n=40):
    vector_results = get_db().similarity_search(query, k=k_vector)

    bm25_obj, chunks_list = get_bm25()
    tokenized_query = tokenize(query)
    bm25_scores = bm25_obj.get_scores(tokenized_query)
    top_bm25_indices = sorted(
        range(len(bm25_scores)),
        key=lambda i: bm25_scores[i],
        reverse=True
    )[:k_bm25]

    class SimpleDoc:
        def __init__(self, content, metadata):
            self.page_content = content
            self.metadata = metadata

    bm25_results = [
        SimpleDoc(chunks_list[i]["content"], chunks_list[i].get("metadata", {}))
        for i in top_bm25_indices
    ]

    def doc_key(doc):
        md = getattr(doc, "metadata", {}) or {}
        key = md.get("id") or md.get("source") or md.get("title")
        if key:
            return f"{key}|{md.get('page', '')}"
        return str(hash(doc.page_content))

    scores = {}
    doc_map = {}

    for i, doc in enumerate(vector_results):
        k = doc_key(doc)
        doc_map[k] = doc
        scores[k] = scores.get(k, 0.0) + 1.0 / (rrf_k + (i + 1))

    for i, doc in enumerate(bm25_results):
        k = doc_key(doc)
        if k not in doc_map:
            doc_map[k] = doc
        scores[k] = scores.get(k, 0.0) + 1.0 / (rrf_k + (i + 1))

    ranked_keys = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
    ranked_docs = [doc_map[k] for k in ranked_keys][:top_n]

    return ranked_docs

# -----------------------------
# FASTAPI APP SETUP
# -----------------------------
app = FastAPI(title="AI Research RAG Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str

class SourceDoc(BaseModel):
    content: str
    title: str
    page: str

class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceDoc]

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    query = request.query
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    try:
        reranker_model = get_reranker()
        llm_chain = get_llm()
        
        # Hybrid retrieval
        docs = hybrid_retrieval(query)
        if not docs:
            return ChatResponse(answer="Not found in provided papers.", sources=[])
            
        # Rerank
        pairs = [[query, doc.page_content] for doc in docs]
        scores = reranker_model.predict(pairs)
        
        ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
        top_docs = [doc for doc, _ in ranked[:8]]
        
        context_str = "\n\n".join([
            f"Paper: {doc.metadata.get('title')} | Page: {doc.metadata.get('page')}\n{doc.page_content}"
            for doc in top_docs
        ])
        
        answer = llm_chain.invoke({
            "context": context_str,
            "question": query
        })
        
        sources_list = []
        for doc in top_docs:
            sources_list.append(SourceDoc(
                content=doc.page_content,
                title=doc.metadata.get("title") or "Unknown Paper",
                page=str(doc.metadata.get("page") or "?")
            ))
            
        return ChatResponse(answer=answer, sources=sources_list)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------
# EVALUATION ENDPOINTS
# -----------------------------
eval_status = {
    "status": "IDLE",  # IDLE, RUNNING, COMPLETED, FAILED
    "error": None,
    "last_run": None,
    "limit": 5
}

def run_evaluation_task(limit: int, model: str):
    global eval_status
    eval_status["status"] = "RUNNING"
    eval_status["error"] = None
    
    try:
        cmd = ["python", "evaluate_ragas.py", "--limit", str(limit), "--model", model]
        process = subprocess.run(
            cmd,
            cwd=BASE_DIR,
            capture_output=True,
            text=True
        )
        if process.returncode == 0:
            eval_status["status"] = "COMPLETED"
            eval_status["last_run"] = datetime.datetime.now().isoformat()
        else:
            eval_status["status"] = "FAILED"
            eval_status["error"] = process.stderr or process.stdout or "Unknown execution error"
    except Exception as e:
        eval_status["status"] = "FAILED"
        eval_status["error"] = str(e)

class RunEvalRequest(BaseModel):
    limit: int = 5
    model: str = "llama-3.1-8b-instant"

@app.post("/api/evaluation/run")
async def run_evaluation(request: RunEvalRequest, background_tasks: BackgroundTasks):
    global eval_status
    if eval_status["status"] == "RUNNING":
        return {"message": "Evaluation is already running.", "status": eval_status}
        
    eval_status["limit"] = request.limit
    background_tasks.add_task(run_evaluation_task, request.limit, request.model)
    return {"message": "Evaluation started in background.", "status": eval_status}

@app.get("/api/evaluation/status")
async def get_evaluation_status():
    return eval_status

def sanitize_data(val):
    import math
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    elif isinstance(val, dict):
        return {k: sanitize_data(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [sanitize_data(x) for x in val]
    return val

@app.get("/api/evaluation/stats")
async def evaluation_stats():
    if not os.path.exists(eval_results_path):
        return {"exists": False, "message": "No evaluation results found. Run evaluation first."}
        
    try:
        with open(eval_results_path, "r", encoding="utf-8") as f:
            eval_data = json.load(f)
            
        # Recursively sanitize all NaN/Inf values at all nesting levels to prevent serialization errors
        sanitized_data = sanitize_data(eval_data)
        sanitized_data["exists"] = True
        return sanitized_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load evaluation: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
