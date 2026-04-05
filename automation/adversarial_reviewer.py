# Uses gemini-3-flash-preview: free tier, strong reasoning for genuine judgment

import json
import os
import re
import time

from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3-flash-preview"

ADVERSARIAL_PROMPT = """You are reviewing extracted quotes from a health document. Your job is to challenge whether each quote is a genuine programmatic commitment or just aspiration, context description, or vague intent.

Score each quote 1-5:
5 = Specific programmatic commitment — names what will happen, how, or who
4 = Clear commitment with minor ambiguity
3 = Aspiration phrased as commitment — debatable
2 = Background description, not a commitment
1 = Not a commitment — remove

A genuine commitment names something concrete. "We will work toward" is not a commitment. "Community members will co-design programme materials" is.

Also flag if the category seems wrong.

Doc: {title} ({org}, {year})

Quotes to review:
{quotes}

Return ONLY valid JSON, no markdown:
[{{"quote": "...", "category": "...", "credibility_score": 4, "keep": true, "adversarial_note": "brief note if score under 4"}}]"""

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

def run_adversarial_reviewer(documents):
    reviewed = []
    for doc in documents:
        promises = doc.get("promises", [])
        if not promises:
            doc["credibility_score"] = None
            doc["review_flags"] = ["no_promises_found"]
            reviewed.append(doc)
            continue

        prompt = ADVERSARIAL_PROMPT.replace("{title}", doc.get("title", ""))
        prompt = prompt.replace("{org}", doc.get("org", ""))
        prompt = prompt.replace("{year}", str(doc.get("year", "")))
        prompt = prompt.replace("{quotes}", json.dumps(promises, indent=2))

        raw = call_gemini(prompt)
        flags = []

        if raw:
            raw = re.sub(r"```json\s*|\s*```", "", raw).strip()
            try:
                result = json.loads(raw)
                kept = [q for q in result if q.get("keep", True) and q.get("credibility_score", 0) >= 3]
                doc["promises"] = kept
                if kept:
                    scores = [q.get("credibility_score", 3) for q in kept]
                    doc["credibility_score"] = sum(scores) / len(scores)
                    if doc["credibility_score"] < 3.5:
                        flags.append("low_avg_credibility")
                else:
                    doc["credibility_score"] = None
                    flags.append("all_quotes_removed_by_review")
            except json.JSONDecodeError:
                flags.append("adversarial_parse_failed")
        else:
            flags.append("adversarial_call_failed")

        doc["review_flags"] = flags
        reviewed.append(doc)
        time.sleep(2)
    return reviewed
