import json
import os
import hashlib
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data.json"
QUEUE_FILE = ROOT / "review_queue.json"

PROMISE_CATEGORIES = ["community_ownership", "context_sensitivity", "participation", "sustainability", "equity"]

def load_data():
    if DATA_FILE.exists():
        with open(DATA_FILE) as f:
            return json.load(f)
    return {
        "last_updated": "",
        "total_documents": 0,
        "promise_counts": {c: 0 for c in PROMISE_CATEGORIES},
        "documents": []
    }

def load_review_queue():
    if QUEUE_FILE.exists():
        with open(QUEUE_FILE) as f:
            return json.load(f)
    return {"last_updated": "", "pending_review": [], "flagged_low_credibility": [], "flagged_ambiguous_source": []}

def make_id(url):
    return hashlib.sha256(url.encode()).hexdigest()[:16]

def run_updater(documents):
    data = load_data()
    queue = load_review_queue()
    existing_ids = {d["id"] for d in data["documents"]}
    added = 0

    for doc in documents:
        promises = doc.get("promises", [])
        if not promises:
            continue
        credibility = doc.get("credibility_score")
        if credibility is not None and credibility < 2.5:
            continue

        doc_id = make_id(doc.get("url", ""))
        if doc_id in existing_ids:
            continue

        entry = {
            "id": doc_id,
            "org": doc.get("org", "Other"),
            "org_color": doc.get("org_color", "#6B7280"),
            "doc_type": doc.get("doc_type", "other"),
            "year": doc.get("year"),
            "title": doc.get("title", ""),
            "url": doc.get("url", ""),
            "source": doc.get("source", ""),
            "summary": doc.get("summary", ""),
            "visual_type": doc.get("visual_type", "illustration"),
            "visual_path": doc.get("visual_path", ""),
            "promises": promises,
            "paired_evaluation_id": None,
            "evaluation_findings": [],
            "auto_added": True,
            "reviewed": False,
            "credibility_score": credibility,
            "review_flags": doc.get("review_flags", [])
        }

        data["documents"].append(entry)
        existing_ids.add(doc_id)

        for p in promises:
            cat = p.get("category")
            if cat in data["promise_counts"]:
                data["promise_counts"][cat] += 1

        queue_entry = {
            "id": doc_id,
            "title": entry["title"],
            "org": entry["org"],
            "added": datetime.utcnow().strftime("%Y-%m-%d")
        }
        queue["pending_review"].append(queue_entry)

        flags = entry.get("review_flags", [])
        if "low_avg_credibility" in flags or "all_quotes_removed_by_review" in flags:
            queue["flagged_low_credibility"].append(queue_entry)

        added += 1

    # IMPORTANT: Only update timestamps and write files if something was actually added.
    # This prevents empty-day commits to git.
    if added > 0:
        data["total_documents"] = len(data["documents"])
        data["last_updated"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        queue["last_updated"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        with open(DATA_FILE, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        with open(QUEUE_FILE, "w") as f:
            json.dump(queue, f, indent=2, ensure_ascii=False)

        print(f"Updater: added {added} documents. Total: {data['total_documents']}")
    else:
        print("Updater: no new documents passed quality checks. Files unchanged.")

    return added
