import pyarrow.dataset  # Fix Windows access violation DLL conflict with PyTorch/CUDA
import os
import json
from pathlib import Path
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
import torch

BASE_DIR = Path(__file__).resolve().parent

def main():
    print("Loading research papers from data/selected_papers...")
    docs = []
    pdf_dir = BASE_DIR / "data" / "selected_papers"
    if not pdf_dir.exists():
        print(f"[ERROR] PDF directory does not exist: {pdf_dir}")
        return
        
    pdf_files = list(pdf_dir.glob("*.pdf"))
    if not pdf_files:
        print("[ERROR] No PDF files found in the data folder.")
        return
        
    for pdf_file in pdf_files:
        try:
            loader = PyMuPDFLoader(str(pdf_file))
            docs.extend(loader.load())
        except Exception as e:
            print(f"Failed to load {pdf_file.name}: {e}")

    print(f"Loaded {len(docs)} pages from {len(pdf_files)} PDFs")

    # Load AI/LLM definitions and merge into docs
    definitions_path = BASE_DIR / "data" / "ai_definitions.json"
        
    if definitions_path.exists():
        with open(definitions_path, "r", encoding="utf-8") as f:
            definitions = json.load(f)
        
        definition_docs = []
        for entry in definitions:
            text = f"{entry['term']}: {entry['definition']}"
            doc = Document(
                page_content=text,
                metadata={
                    "source": "ai_definitions.json",
                    "title": "AI & LLM Definitions",
                    "term": entry["term"],
                    "page": 0
                }
            )
            definition_docs.append(doc)
            
        docs.extend(definition_docs)
        print(f"Added {len(definition_docs)} definitions. Total documents: {len(docs)}")

    # Chunking documents with LARGER chunks (chunk_size=1000, chunk_overlap=200)
    print("\nChunking documents (size=1000, overlap=200)...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    chunks = text_splitter.split_documents(docs)
    print(f"Created {len(chunks)} chunks.")

    # Save chunks.json for BM25 and Hybrid retrieval
    print("\nBuilding BM25 index and saving chunks.json...")
    chunks_data = []
    for chunk in chunks:
        chunks_data.append({
            'content': chunk.page_content,
            'metadata': chunk.metadata
        })

    chunks_file = BASE_DIR / 'chunks.json'
    with open(chunks_file, 'w', encoding='utf-8') as f:
        json.dump(chunks_data, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(chunks)} chunks to chunks.json")

    # Embed and build FAISS Vector Store
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\nLoading embedding model BAAI/bge-large-en-v1.5 on {device}...")
    embedding_model = HuggingFaceEmbeddings(
        model_name="BAAI/bge-large-en-v1.5",
        model_kwargs={"device": device},
        encode_kwargs={
            "normalize_embeddings": True,
            "batch_size": 32
        }
    )

    print("\nGenerating embeddings and building FAISS index (this may take a few minutes)...")
    db = FAISS.from_documents(chunks, embedding_model)
    faiss_dir = BASE_DIR / "faiss_index"
    db.save_local(str(faiss_dir))
    print("\nFAISS index created and saved successfully!")

if __name__ == "__main__":
    main()
