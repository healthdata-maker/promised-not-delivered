# Uses gemini-3.1-flash-lite-preview: free tier, optimised for high-volume structured extraction

import json
import os
import re
import time

from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3.1-flash-lite-preview"

PROMISE_PROMPT = """Analyse this global health document for rhetorical commitments about HOW programmes will be run.

Extract ONLY direct quotes that make commitments in these five categories:
community_ownership — "community-led", "locally owned", "community-driven", "communities will design"
context_sensitivity — "context-specific", "culturally appropriate", "tailored to local", "locally adapted"
participation — "participatory approach", "co-design with communities", "communities as partners"
sustainability — "sustainable beyond the project", "country ownership", "self-sustaining"
equity — "most vulnerable", "leave no one behind", "reaching the hardest to reach", "equity-focused"

Rules:
- Only exact quotes from the text, not paraphrases
- Only genuine programmatic commitments, not background description
- Each quote must be 10-60 words
- Return ONLY valid JSON, no markdown, no explanation

Format:
[{{"quote": "exact text", "category": "community_ownership", "approximate_position": "early/mid/late"}}]

If no relevant quotes: []

DOCUMENT:
{text}"""

def call_gemini(prompt, retries=4):
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(model=MODEL, contents=prompt)
            return resp.text.strip()
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                wait = 10 * (2 ** attempt)
                print(f"Rate limited. Waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"Gemini error: {e}")
                return None
    return None

def run_promise_detector(documents):
    results = []
    for doc in documents:
        text = doc.get("extracted_text", "")
        if not text:
            continue
        prompt = PROMISE_PROMPT.replace("{text}", text[:12000])
        raw = call_gemini(prompt)
        if raw:
            raw = re.sub(r"```json\s*|\s*```", "", raw).strip()
            try:
                promises = json.loads(raw)
                doc["promises"] = promises if isinstance(promises, list) else []
            except json.JSONDecodeError:
                doc["promises"] = []
        else:
            doc["promises"] = []
        if doc["promises"]:
            results.append(doc)
        time.sleep(2)
    return results
