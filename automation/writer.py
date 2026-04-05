# Uses gemini-3-flash-preview: quality output for human-readable summaries

import os
import time

from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3-flash-preview"

WRITER_PROMPT = """Write a one-paragraph plain-English summary of what this document either promised or found. Writing for a general reader who follows global health policy.

RHYTHM: Vary sentence length aggressively. At least one sentence under 5 words. At least one over 35 words. Never three sentences the same length.

PUNCTUATION: No em-dashes. Use regular hyphen with spaces ( - ) if needed. No colons introducing lists.

TONE: Take a position. If promises look like they weren't kept, say so plainly. Leave something unresolved.

BANNED WORDS: furthermore, moreover, notably, robust, comprehensive, transformative, innovative, facilitate, leverage, underscore, multifaceted, pivotal, crucial, culminate, streamline, seamlessly, groundbreaking, paradigm, synergy, ecosystem, cornerstone, vibrant, dynamic, holistic, impactful, actionable, delve, harness, elevate, unleash, foster, empower

BANNED OPENERS: Furthermore / Moreover / Additionally / Consequently / Notably / Importantly / Indeed / Ultimately / This suggests that / This reflects

BANNED PATTERNS: "It's not about X, it's about Y" / Ending by explaining what the paragraph means / Rhetorical question immediately answered

PLAIN WORDS: use not utilize, show not demonstrate, need not require, help not facilitate, change not transform

SPECIFICITY: Name the year, org, or region if available. Concrete over vague.

LENGTH: One paragraph, 60-90 words.

Doc:
Title: {title}
Org: {org}
Year: {year}
Type: {doc_type}
Key quotes: {quotes}

Write the summary:"""

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

def run_writer(documents):
    for doc in documents:
        promises = doc.get("promises", [])
        if not promises:
            doc["summary"] = ""
            continue
        quotes_text = " | ".join([q.get("quote", "") for q in promises[:3]])
        prompt = WRITER_PROMPT.replace("{title}", doc.get("title", ""))
        prompt = prompt.replace("{org}", doc.get("org", ""))
        prompt = prompt.replace("{year}", str(doc.get("year", "")))
        prompt = prompt.replace("{doc_type}", doc.get("doc_type", ""))
        prompt = prompt.replace("{quotes}", quotes_text)
        result = call_gemini(prompt)
        doc["summary"] = result or ""
        time.sleep(2)
    return documents
