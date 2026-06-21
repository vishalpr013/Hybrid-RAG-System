import pyarrow.dataset  # Fix Windows access violation DLL conflict with PyTorch/CUDA
import os
import json
import argparse
import pandas as pd
import torch
from datasets import Dataset
from dotenv import load_dotenv

# Ragas imports
from ragas import evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics._faithfulness import Faithfulness
from ragas.metrics._answer_relevance import AnswerRelevancy
from ragas.metrics._context_precision import ContextPrecision
from ragas.metrics._context_recall import ContextRecall

# LangChain imports
from langchain_groq import ChatGroq
from langchain_core.outputs import ChatResult
from langchain_huggingface import HuggingFaceEmbeddings

# Import RAG pipeline components from main.py
from main import hybrid_retrieval, get_reranker, get_llm

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load environment variables
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

import asyncio
# Global rate-limiting semaphore to prevent overloading Groq's concurrency limits
GROQ_SEMAPHORE = asyncio.Semaphore(2)

# Create a custom wrapper for ChatGroq to handle n > 1 parameter requested by Ragas
class ChatGroqWithN(ChatGroq):
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = kwargs.pop("n", None)
        if n is None:
            n = self.n or 1
            
        if n <= 1:
            return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
        
        original_n = self.n
        self.n = 1
        try:
            generations = []
            token_usage = {}
            for _ in range(n):
                res = super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
                generations.extend(res.generations)
                if res.llm_output and "token_usage" in res.llm_output:
                    for k, v in res.llm_output["token_usage"].items():
                        if v is not None:
                            token_usage[k] = token_usage.get(k, 0) + v
            return ChatResult(generations=generations, llm_output={"token_usage": token_usage})
        finally:
            self.n = original_n

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        n = kwargs.pop("n", None)
        if n is None:
            n = self.n or 1
            
        if n <= 1:
            async with GROQ_SEMAPHORE:
                res = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
                await asyncio.sleep(0.5)
                return res
        
        original_n = self.n
        self.n = 1
        try:
            results = []
            for _ in range(n):
                async with GROQ_SEMAPHORE:
                    res = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
                results.append(res)
                await asyncio.sleep(0.5)
            
            generations = []
            token_usage = {}
            for res in results:
                generations.extend(res.generations)
                if res.llm_output and "token_usage" in res.llm_output:
                    for k, v in res.llm_output["token_usage"].items():
                        if v is not None:
                            token_usage[k] = token_usage.get(k, 0) + v
            return ChatResult(generations=generations, llm_output={"token_usage": token_usage})
        finally:
            self.n = original_n

def main():
    parser = argparse.ArgumentParser(description="Run Ragas evaluation on the RAG pipeline.")
    parser.add_argument("--limit", type=int, default=5, help="Number of questions to evaluate (default: 5)")
    parser.add_argument("--output", type=str, default="ragas_evaluation_results.json", help="Output JSON path")
    parser.add_argument("--model", type=str, default="llama-3.1-8b-instant", help="Groq model to use as LLM judge")
    args = parser.parse_args()

    if not GROQ_API_KEY:
        print("[ERROR] GROQ_API_KEY not found in environment. Please set it in your .env file.")
        return

    # Load questions
    eval_questions_path = os.path.join(BASE_DIR, "eval_questions.json")
    if not os.path.exists(eval_questions_path):
        print(f"[ERROR] eval_questions.json not found in {eval_questions_path}.")
        return

    with open(eval_questions_path, "r", encoding="utf-8") as f:
        qa_pairs = json.load(f)

    if args.limit > 0:
        qa_pairs = qa_pairs[:args.limit]

    print(f"Starting Ragas evaluation on {len(qa_pairs)} questions...")

    # Load pipeline helpers
    reranker = get_reranker()
    chain = get_llm()

    # 1. Run RAG pipeline to generate answers and retrieve contexts
    data = []
    for idx, item in enumerate(qa_pairs):
        question = item["question"]
        ground_truth = item["ground_truth"]
        print(f"\n[{idx+1}/{len(qa_pairs)}] Question: {question}")
        
        try:
            # Hybrid retrieval
            docs = hybrid_retrieval(question)
            
            # CrossEncoder Reranking
            pairs = [[question, doc.page_content] for doc in docs]
            scores = reranker.predict(pairs)
            
            ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
            top_docs = [doc for doc, _ in ranked[:8]]
            
            # Context strings
            contexts = [doc.page_content for doc in top_docs]
            context_str = "\n\n".join([
                f"Paper: {doc.metadata.get('title')} | Page: {doc.metadata.get('page')}\n{doc.page_content}"
                for doc in top_docs
            ])
            
            # Answer generation
            answer = chain.invoke({
                "context": context_str,
                "question": question
            })
            
            print(f"Answer: {answer[:120]}...")
            
            # Clean answer for Ragas (strip out the Sources block so the judge doesn't flag citations as hallucinations)
            clean_answer = answer
            if "Sources:" in answer:
                clean_answer = answer.split("Sources:")[0].strip()
            elif "Sources" in answer:
                clean_answer = answer.split("Sources")[0].strip()
            
            if clean_answer.startswith("Answer:"):
                clean_answer = clean_answer[len("Answer:"):].strip()
                
            data.append({
                "question": question,
                "answer": clean_answer,
                "contexts": contexts,
                "ground_truth": ground_truth
            })
        except Exception as e:
            print(f"[WARNING] Failed to process question: {e}")
            continue

    if not data:
        print("[ERROR] No data successfully processed. Exiting.")
        return

    # 2. Build Dataset
    print("\nFormatting evaluation dataset...")
    dataset = Dataset.from_dict({
        "question": [d["question"] for d in data],
        "answer": [d["answer"] for d in data],
        "contexts": [d["contexts"] for d in data],
        "ground_truth": [d["ground_truth"] for d in data]
    })

    # 3. Configure Ragas LLM & Embeddings wrappers
    print(f"Initializing Ragas Judge (LLM: {args.model})...")
    evaluator_llm = LangchainLLMWrapper(ChatGroqWithN(
        groq_api_key=GROQ_API_KEY,
        model_name=args.model,
        temperature=0.0
    ))
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading HuggingFace BGE Embeddings for evaluator on {device}...")
    evaluator_embeddings = LangchainEmbeddingsWrapper(HuggingFaceEmbeddings(
        model_name="BAAI/bge-large-en-v1.5",
        model_kwargs={"device": device},
        encode_kwargs={"normalize_embeddings": True}
    ))

    # 4. Initialize Ragas Metrics
    print("Initializing Ragas core metrics...")
    metrics = [
        Faithfulness(),
        AnswerRelevancy(),
        ContextPrecision(),
        ContextRecall()
    ]

    # 5. Run Evaluation
    print("Running evaluation metrics (Faithfulness, Answer Relevance, Context Precision, Context Recall)...")
    from ragas.run_config import RunConfig
    run_config = RunConfig(timeout=360, max_workers=2)
    try:
        result = evaluate(
            dataset=dataset,
            metrics=metrics,
            llm=evaluator_llm,
            embeddings=evaluator_embeddings,
            allow_nest_asyncio=True,
            run_config=run_config
        )
    except Exception as e:
        print(f"[ERROR] Ragas evaluation failed: {e}")
        if args.model != "llama-3.1-8b-instant":
            print("Attempting fallback evaluation with llama-3.1-8b-instant...")
            evaluator_llm = LangchainLLMWrapper(ChatGroqWithN(
                groq_api_key=GROQ_API_KEY,
                model_name="llama-3.1-8b-instant",
                temperature=0.0
            ))
            result = evaluate(
                dataset=dataset,
                metrics=metrics,
                llm=evaluator_llm,
                embeddings=evaluator_embeddings,
                allow_nest_asyncio=True,
                run_config=run_config
            )
        else:
            raise e

    # 6. Process and Output Summary
    print("\nEvaluation Complete! Summary Table:")
    print("=" * 40)
    for metric_name, score in result._repr_dict.items():
        print(f"{metric_name:25} : {score:.4f}")
    print("=" * 40)

    # 7. Save detailed JSON
    df = result.to_pandas()
    
    summary = {
        "faithfulness": float(df["faithfulness"].mean()) if "faithfulness" in df else 0.0,
        "answer_relevance": float(df["answer_relevancy"].mean()) if "answer_relevancy" in df else 0.0,
        "context_precision": float(df["context_precision"].mean()) if "context_precision" in df else 0.0,
        "context_recall": float(df["context_recall"].mean()) if "context_recall" in df else 0.0,
        "total_questions": len(df),
        "per_question": df.to_dict(orient="records")
    }

    output_path = os.path.join(BASE_DIR, args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"\nDetailed results saved to: {output_path}")

if __name__ == "__main__":
    main()
