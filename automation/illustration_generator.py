# Generates monochromatic editorial SVG illustrations for strategy documents.
# Style: The Economist / EPW woodcut aesthetic.
# Saves to illustrations/{doc_id}.svg
# Only generates for new documents where visual_type == "illustration"
# and no illustration already exists.

import os
import time
from pathlib import Path

from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3-flash-preview"

ROOT = Path(__file__).parent.parent
ILLUSTRATIONS_DIR = ROOT / "illustrations"

ILLUSTRATION_PROMPT = """You are an editorial illustrator. You create conceptual SVG illustrations in the style of The Economist magazine — stark, monochromatic, geometric, metaphorical. No photography. No gradients. Hard lines. Flat shapes. One or two colours only.

Create a minimal SVG illustration that visually represents this concept:

Document: {title}
Key theme: {theme}
Promise category: {category}

Technical requirements:
- viewBox="0 0 400 300"
- Background: {bg_color}
- Primary illustration colour: {fg_color}
- Style: crosshatch fills for shadow, hard geometric shapes, editorial metaphor
- Must be a valid, complete SVG
- No text elements (the title is shown separately)
- Conceptual and abstract — not literal
- Maximum 30 SVG elements total

Return ONLY the complete SVG element starting with <svg and ending with </svg>. Nothing else."""

CATEGORY_THEMES = {
    "community_ownership": "A hand holding a torch, passed between figures",
    "context_sensitivity": "A map with different textures in different regions",
    "participation": "Concentric circles radiating from a central point",
    "sustainability": "A plant growing through cracked concrete",
    "equity": "A balance scale with figures on each side"
}

def call_gemini_for_svg(prompt, retries=3):
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(model=MODEL, contents=prompt)
            text = resp.text.strip()
            if "<svg" in text:
                start = text.index("<svg")
                end = text.rindex("</svg>") + 6
                return text[start:end]
            return None
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                wait = 15 * (2 ** attempt)
                print(f"Rate limited on illustration. Waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"Illustration generation error: {e}")
                return None
    return None

def get_primary_category(promises):
    if not promises:
        return "community_ownership"
    from collections import Counter
    cats = [p.get("category", "") for p in promises]
    return Counter(cats).most_common(1)[0][0] if cats else "community_ownership"

def fallback_svg(org_color, category):
    return f"""<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#0D0D0F"/>
  <circle cx="200" cy="150" r="80" fill="none" stroke="{org_color}" stroke-width="2"/>
  <circle cx="200" cy="150" r="50" fill="none" stroke="{org_color}" stroke-width="1" stroke-dasharray="4 4"/>
  <line x1="120" y1="150" x2="280" y2="150" stroke="{org_color}" stroke-width="1.5"/>
  <line x1="200" y1="70" x2="200" y2="230" stroke="{org_color}" stroke-width="1.5"/>
  <rect x="170" y="130" width="60" height="40" fill="{org_color}" opacity="0.15"/>
</svg>"""

def run_illustration_generator(documents):
    ILLUSTRATIONS_DIR.mkdir(exist_ok=True)
    generated = 0

    for doc in documents:
        if doc.get("visual_type") != "illustration":
            continue

        # Use the pre-computed ID from visual_router, or compute it now
        doc_id = doc.get("_computed_id") or doc.get("id", "unknown")
        path = ILLUSTRATIONS_DIR / f"{doc_id}.svg"

        if path.exists():
            continue  # already exists, skip

        category = get_primary_category(doc.get("promises", []))
        theme = CATEGORY_THEMES.get(category, "A figure making a promise")
        org_color = doc.get("org_color", "#E8E4DC")

        prompt = ILLUSTRATION_PROMPT.replace("{title}", doc.get("title", "")[:100])
        prompt = prompt.replace("{theme}", theme)
        prompt = prompt.replace("{category}", category)
        prompt = prompt.replace("{bg_color}", "#0D0D0F")
        prompt = prompt.replace("{fg_color}", org_color)

        svg = call_gemini_for_svg(prompt)
        if not svg:
            svg = fallback_svg(org_color, category)
            print(f"Using fallback illustration for {doc_id}")

        with open(path, "w") as f:
            f.write(svg)

        generated += 1
        time.sleep(3)

    print(f"Illustrations: generated {generated} new SVGs")
