import sys
import os

# CRITICAL: Add this directory to Python path so sibling modules can be found
# when this script is called from the repo root by GitHub Actions.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

extracted = run_extractor(new_docs)
print(f"Extractor: {len(extracted)} with text")

if not extracted:
    print("No documents had extractable text. Pipeline exiting cleanly.")
    sys.exit(0)

with_promises = run_promise_detector(extracted)
print(f"Promise detector: {len(with_promises)} with promises")

reviewed = run_adversarial_reviewer(with_promises)
print(f"Adversarial review done")

with_summaries = run_writer(reviewed)
print(f"Writer done")

# Route visuals: decide chart vs illustration for each doc
routed = run_visual_router(with_summaries)

# Generate charts (refreshes aggregate charts from all data.json entries)
run_chart_generator()

# Generate illustrations for new strategy docs
run_illustration_generator(routed)

added = run_updater(routed)
if added == 0:
    print("Pipeline ran but no documents passed quality checks. Nothing committed.")
else:
    print(f"Pipeline complete. {added} new documents added.")
