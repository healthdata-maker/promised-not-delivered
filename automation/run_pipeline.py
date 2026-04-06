import sys
import os
import json
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = Path(__file__).parent.parent
CHECKPOINT_FILE = ROOT / "automation" / "day_zero_checkpoint.json"
MAX_DOCS_PER_RUN = 60

from scout import run_scout
from extractor import run_extractor
from promise_detector import run_promise_detector
from adversarial_reviewer import run_adversarial_reviewer
from writer import run_writer
from visual_router import run_visual_router
from chart_generator import run_chart_generator
from illustration_generator import run_illustration_generator
from updater import run_updater

IS_DAY_ZERO = os.environ.get('IS_DAY_ZERO', 'false').lower() == 'true'
print(f"Pipeline starting. Day zero mode: {IS_DAY_ZERO}")

new_docs = run_scout(day_zero=IS_DAY_ZERO)
print(f"Scout: {len(new_docs)} new documents")

if not new_docs:
    print("No new documents found today. Pipeline exiting cleanly.")
    sys.exit(0)

processed_urls = set()

if IS_DAY_ZERO and len(new_docs) > MAX_DOCS_PER_RUN:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            processed_urls = set(json.load(f))
        print(f"Checkpoint loaded: {len(processed_urls)} URLs already processed")

    pending = [d for d in new_docs if d["url"] not in processed_urls]
    print(f"{len(pending)} documents still pending")

    if not pending:
        print("All Day 0 documents processed. Checkpoint complete.")
        CHECKPOINT_FILE.unlink(missing_ok=True)
        sys.exit(0)

    batch = pending[:MAX_DOCS_PER_RUN]
    print(f"Processing batch of {len(batch)} this run. {len(pending) - len(batch)} will process next run.")
    new_docs = batch

extracted = run_extractor(new_docs)
print(f"Extractor: {len(extracted)} with text")

if not extracted:
    print("No extractable text found. Saving checkpoint and exiting.")
    if IS_DAY_ZERO:
        processed_urls.update(d["url"] for d in new_docs)
        with open(CHECKPOINT_FILE, "w") as f:
            json.dump(list(processed_urls), f)
    sys.exit(0)

with_promises = run_promise_detector(extracted)
print(f"Promise detector: {len(with_promises)} with promises")

reviewed = run_adversarial_reviewer(with_promises)
print(f"Adversarial review done")

with_summaries = run_writer(reviewed)
print(f"Writer done")

routed = run_visual_router(with_summaries)

run_chart_generator()

run_illustration_generator(routed)

added = run_updater(routed)

if IS_DAY_ZERO:
    processed_urls.update(d["url"] for d in new_docs)
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(list(processed_urls), f)
    print(f"Checkpoint saved. Trigger Day 0 again to process the next batch.")

if added == 0:
    print("Pipeline ran but no documents passed quality checks. Nothing committed.")
else:
    print(f"Pipeline complete. {added} new documents added.")
