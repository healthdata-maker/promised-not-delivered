import json
import os
import time
from datetime import datetime
from pathlib import Path
from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3-flash-preview"

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data.json"
PAPERS_FILE = ROOT / "papers.json"

AUTHOR_PROMPT = """You are a rigorous global health policy analyst. 
Analyze the provided document data. Identify a major thematic contradiction or trend between what organizations promise and what actually happens.
CRITICAL RULE: You must pick a completely new topic. Do NOT write about any of these past topics: {past_topics}
Write a sharp, cynical, 400-word working paper draft. Cite specific organizations.
Data: {data}"""

CRITIC_PROMPT = """You are a ruthless peer-reviewer for a top-tier academic journal.
Read this draft working paper. Your goal is to destroy its arguments. 
Identify logical leaps, places where the data does not support the claims, and generic jargon.
Provide a brutal bulleted critique.
Draft: {draft}"""

EDITOR_PROMPT = """You are the final editor. Rewrite the working paper to fix every flaw pointed out by the critic. 
Tone: Academic, data-grounded, cynical, and highly rigorous. No jargon. No em dashes.
VISUALIZATION: You must embed exactly one relevant data chart. Choose ONE of these image links that best fits your argument and place it on its own line:
<img src="charts/promise_counts.svg" class="paper-chart">
<img src="charts/org_breakdown.svg" class="paper-chart">
<img src="charts/promise_timeline.svg" class="paper-chart">
Return ONLY the final rewritten paper formatted in clean HTML (use <p>, <h3>, <ul>).
Draft: {draft}
Critique: {critique}"""

def call_gemini(prompt, retries=3):
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(model=MODEL, contents=prompt)
            return resp.text.strip()
        except Exception as e:
            time.sleep(15 * (2 ** attempt))
    return None

def run_think_tank():
    if not DATA_FILE.exists(): return
    with open(DATA_FILE) as f:
        data = json.load(f)
    
    docs = data.get("documents", [])
    if len(docs) < 10: return

    # Load past topics to enforce uniqueness
    past_topics = []
    papers = []
    if PAPERS_FILE.exists():
        with open(PAPERS_FILE) as f:
            try: 
                papers = json.load(f)
                past_topics = [p["title"] for p in papers][:10]
            except: pass

    recent_docs = json.dumps([{"title": d["title"], "org": d["org"], "promises": d.get("promises", [])} for d in docs[-40:]])

    draft = call_gemini(AUTHOR_PROMPT.replace("{data}", recent_docs).replace("{past_topics}", str(past_topics)))
    if not draft: return

    critique = call_gemini(CRITIC_PROMPT.replace("{draft}", draft))
    if not critique: return

    final_paper = call_gemini(EDITOR_PROMPT.replace("{draft}", draft).replace("{critique}", critique))
    if not final_paper: return

    # Generate a unique title based on the content
    title_prompt = f"Write a 5 to 8 word academic title for this text. No quotes. No colons.\n\n{final_paper}"
    title = call_gemini(title_prompt) or f"Synthesis Report: {datetime.utcnow().strftime('%b %d')}"

    papers.insert(0, {
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "title": title,
        "content": final_paper
    })

    with open(PAPERS_FILE, "w") as f:
        json.dump(papers, f, indent=2)
