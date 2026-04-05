import requests
import time
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:
    import fitz

from bs4 import BeautifulSoup

def extract_from_url(url, max_pages=30):
    try:
        headers = {"User-Agent": "SBC-Research-Tracker/1.0 (academic research; sbctracker@research.org)"}
        r = requests.get(url, headers=headers, timeout=30, stream=True)
        if r.status_code != 200:
            return None

        content_type = r.headers.get("content-type", "").lower()

        if "pdf" in content_type or url.lower().endswith(".pdf"):
            doc = fitz.open(stream=r.content, filetype="pdf")
            text = ""
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                text += page.get_text()
            doc.close()
            return text[:15000]

        elif "html" in content_type:
            soup = BeautifulSoup(r.text, "lxml")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            return soup.get_text(separator=" ", strip=True)[:15000]

    except Exception as e:
        print(f"Extraction error for {url}: {e}")
    return None

def run_extractor(documents):
    extracted = []
    for doc in documents:
        text = extract_from_url(doc["url"])
        if text and len(text) > 500:
            doc["extracted_text"] = text
            extracted.append(doc)
        time.sleep(1)
    return extracted
