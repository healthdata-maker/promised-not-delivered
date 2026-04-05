# Decides: does this document get an editorial illustration or a data chart?
# Strategy docs -> illustration (represents the promise being made)
# Evaluation docs -> chart annotation (their data lives in the aggregate charts)
# Other -> illustration as default
#
# IMPORTANT: We compute the doc ID here from the URL (same hash as updater.py)
# because the ID field is not set until updater.py runs later.

import hashlib

def make_doc_id(url):
    return hashlib.sha256(url.encode()).hexdigest()[:16]

def run_visual_router(documents):
    for doc in documents:
        # Compute ID from URL now, consistent with updater.py's make_id()
        doc_id = make_doc_id(doc.get("url", ""))
        if doc.get("doc_type") == "evaluation":
            doc["visual_type"] = "chart_reference"
            doc["visual_path"] = "charts/promise_timeline.svg"
        else:
            doc["visual_type"] = "illustration"
            doc["visual_path"] = f"illustrations/{doc_id}.svg"
        # Store the computed id so illustration_generator can use it
        doc["_computed_id"] = doc_id
    return documents
