import requests
import json
import os
import sys
import time
import hashlib
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent.parent
SEEN_FILE = ROOT / "seen_urls.json"

SEARCH_QUERIES = [
    "social behaviour change community led global health strategy",
    "SBC social behavior change UNICEF strategy document",
    "communication for development C4D WHO strategy",
    "behaviour change communication evaluation global health Africa",
    "health promotion community owned intervention evaluation",
    "social behaviour change programme assessment sub-saharan africa",
    "SBC programme evaluation failed implementation community",
    "USAID social behavior change strategy document",
    "GAVI demand generation community strategy",
    "social norms behaviour change evaluation findings",
    "community participation health intervention evaluation",
    "locally owned health programme evaluation findings",
    "context specific health communication strategy document",
    "behaviour change intervention sustainability evaluation",
    "equity focused SBC programme evaluation",
]

PUBMED_QUERIES = [
    "social behavior change communication SBCC evaluation Africa",
    "behaviour change communication programme effectiveness",
    "community led health intervention evaluation findings",
    "SBC health promotion programme assessment global south",
    "UNICEF communication for development evaluation",
]

RELIEFWEB_QUERIES = [
    "social behaviour change evaluation",
    "community engagement health programme evaluation",
    "SBCC programme assessment findings",
    "behaviour change communication review",
]

WHO_IRIS_QUERIES = [
    "social behaviour change",
    "health promotion strategy",
    "communication for development",
    "community engagement health",
]

OPENALEX_BASE = "https://api.openalex.org/works"
CORE_BASE = "https://api.core.ac.uk/v3/search/works"
WHO_IRIS_API = "https://iris.who.int/server/api/discover/search/objects"
NCBI_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
NCBI_EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
S2_BASE = "https://api.semanticscholar.org/graph/v1/paper/search"
WB_BASE = "https://search.worldbank.org/api/v2/wds"
RELIEFWEB_BASE = "https://api.reliefweb.int/v1/reports"

ORG_COLORS = {
    "UNICEF": "#00AEEF",
    "WHO": "#008DC9",
    "USAID": "#002F6C",
    "GAVI": "#8B1A4A",
    "World Bank": "#009FDA",
    "Other": "#6B7280"
}

def load_seen_urls():
    if SEEN_FILE.exists():
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()

def save_seen_urls(seen):
    with open(SEEN_FILE, "w") as f:
        json.dump(list(seen), f)

def make_doc_id(url):
    return hashlib.sha256(url.encode()).hexdigest()[:16]

def infer_org(title, venue=""):
    text = (title + " " + venue).lower()
    if "unicef" in text: return "UNICEF"
    if "world health" in text or " who " in text: return "WHO"
    if "usaid" in text: return "USAID"
    if "gavi" in text: return "GAVI"
    if "world bank" in text: return "World Bank"
    return "Other"

def infer_doc_type(title):
    t = title.lower()
    if any(w in t for w in ["evaluation", "assessment", "review", "findings", "impact", "effectiveness", "lessons"]):
        return "evaluation"
    if any(w in t for w in ["strategy", "framework", "plan", "approach", "guidance", "guideline"]):
        return "strategy"
    return "other"

def make_entry(title, url, year, source, org=None, venue=""):
    org = org or infer_org(title, venue)
    return {
        "title": title,
        "url": url,
        "year": year,
        "source": source,
        "org": org,
        "org_color": ORG_COLORS.get(org, "#6B7280"),
        "doc_type": infer_doc_type(title)
    }

def search_openalex(query, from_year=1990):
    results = []
    try:
        params = {
            "search": query,
            "filter": f"publication_year:>{from_year},is_oa:true",
            "per_page": 50,
            "sort": "cited_by_count:desc",
            "mailto": "sbctracker@research.org"
        }
        r = requests.get(OPENALEX_BASE, params=params, timeout=30)
        if r.status_code == 200:
            for item in r.json().get("results", []):
                try:
                    best_oa = item.get("best_oa_location") or {}
                    open_access = item.get("open_access") or {}
                    pdf_url = best_oa.get("pdf_url") or open_access.get("oa_url")
                    if pdf_url:
                        primary = item.get("primary_location") or {}
                        source = primary.get("source") or {}
                        venue = source.get("display_name", "")
                        results.append(make_entry(item.get("title", ""), pdf_url, item.get("publication_year"), "OpenAlex", venue=venue))
                except Exception:
                    continue
        time.sleep(0.5)
    except Exception as e:
        print(f"OpenAlex error: {e}")
    return results
    
def search_core(query, from_year=1990):
    results = []
    core_key = os.environ.get("CORE_API_KEY", "")
    if not core_key:
        return results
    try:
        headers = {"Authorization": f"Bearer {core_key}"}
        for offset in [0, 50, 100]:
            params = {"q": query, "limit": 50, "offset": offset, "stats": False}
            r = requests.get(CORE_BASE, headers=headers, params=params, timeout=30)
            if r.status_code != 200:
                break
            batch = r.json().get("results", [])
            for item in batch:
                year = item.get("yearPublished")
                if year and int(year) < from_year:
                    continue
                pdf = item.get("downloadUrl") or (item.get("sourceFulltextUrls") or [None])[0]
                if pdf:
                    results.append(make_entry(item.get("title", ""), pdf, year, "CORE", venue=item.get("publisher", "")))
            if len(batch) < 50:
                break
            time.sleep(2)
    except Exception as e:
        print(f"CORE error: {e}")
    return results

def search_who_iris(query):
    results = []
    try:
        params = {"query": query, "dsoType": "ITEM", "size": 20, "page": 0}
        r = requests.get(WHO_IRIS_API, params=params, timeout=30, headers={"Accept": "application/json"})
        if r.status_code == 200:
            data = r.json()
            # DSpace 7 API — navigate nested structure defensively
            embedded = data.get("_embedded", {})
            search_result = embedded.get("searchResult", {})
            inner_embedded = search_result.get("_embedded", {})
            objects = inner_embedded.get("objects", [])
            for item in objects:
                try:
                    inner = item.get("_embedded", {}).get("indexableObject", {})
                    handle = inner.get("handle", "")
                    meta = inner.get("metadata", {})
                    title_list = meta.get("dc.title") or []
                    title = title_list[0].get("value", "") if title_list else ""
                    date_list = meta.get("dc.date.issued") or []
                    year = (date_list[0].get("value", "") or "")[:4] or None if date_list else None
                    if handle and title:
                        results.append(make_entry(title, f"https://iris.who.int/handle/{handle}", year, "WHO IRIS", org="WHO"))
                except Exception:
                    continue
        time.sleep(1)
    except Exception as e:
        print(f"WHO IRIS error: {e}")
    return results

def search_pubmed(query, from_year=1990):
    results = []
    try:
        params = {
            "db": "pubmed",
            "term": f"{query} AND {from_year}:2026[pdat]",
            "retmode": "json",
            "retmax": 50,
            "sort": "relevance",
            "tool": "sbc-promise-tracker",
            "email": "sbctracker@research.org"
        }
        r = requests.get(NCBI_ESEARCH, params=params, timeout=30)
        ids = r.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return results

        fetch_params = {
            "db": "pubmed", "id": ",".join(ids),
            "retmode": "xml", "rettype": "abstract",
            "tool": "sbc-promise-tracker", "email": "sbctracker@research.org"
        }
        fr = requests.get(NCBI_EFETCH, params=fetch_params, timeout=30)
        soup = BeautifulSoup(fr.text, "xml")
        for article in soup.find_all("PubmedArticle"):
            title_el = article.find("ArticleTitle")
            pmcid_el = article.find("ArticleId", {"IdType": "pmc"})
            year_el = article.find("Year")
            if title_el and pmcid_el:
                url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid_el.get_text()}/"
                year = year_el.get_text() if year_el else None
                results.append(make_entry(title_el.get_text(), url, year, "PubMed/PMC"))
        time.sleep(0.5)
    except Exception as e:
        print(f"PubMed error: {e}")
    return results

def search_europepmc(query, from_year=1990):
    results = []
    try:
        params = {
            "query": f"{query} OPEN_ACCESS:y PUB_YEAR:[{from_year} TO 2026]",
            "format": "json",
            "pageSize": 50,
            "resultType": "core"
        }
        r = requests.get(EUROPEPMC_BASE, params=params, timeout=30)
        if r.status_code == 200:
            for item in r.json().get("resultList", {}).get("result", []):
                pmcid = item.get("pmcid")
                doi = item.get("doi")
                url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/" if pmcid else (f"https://doi.org/{doi}" if doi else None)
                if url:
                    results.append(make_entry(item.get("title", ""), url, item.get("pubYear"), "Europe PMC", venue=item.get("journalTitle", "")))
        time.sleep(1)
    except Exception as e:
        print(f"Europe PMC error: {e}")
    return results

def search_semanticscholar(query, from_year=1990):
    results = []
    try:
        params = {
            "query": query,
            "fields": "title,year,openAccessPdf,venue",
            "limit": 50,
            "publicationDateOrYear": f"{from_year}:"
        }
        r = requests.get(S2_BASE, params=params, timeout=30)
        if r.status_code == 200:
            for item in r.json().get("data", []):
                oa = item.get("openAccessPdf")
                pdf_url = oa.get("url") if oa else None
                if pdf_url:
                    results.append(make_entry(item.get("title", ""), pdf_url, item.get("year"), "Semantic Scholar", venue=item.get("venue", "")))
        time.sleep(3)
    except Exception as e:
        print(f"Semantic Scholar error: {e}")
    return results

def search_worldbank(query, from_year=1990):
    results = []
    try:
        params = {
            "qterm": query,
            "format": "json",
            "rows": 50,
            "os": 0,
            "fl": "docdt,docty,titl,url",
            "strdate": f"{from_year}-01-01"
        }
        r = requests.get(WB_BASE, params=params, timeout=30)
        if r.status_code == 200:
            docs = r.json().get("documents", {})
            for item in docs.values():
                if isinstance(item, dict) and item.get("url") and item.get("titl"):
                    year = (item.get("docdt") or "")[:4] or None
                    results.append(make_entry(item["titl"], item["url"], year, "World Bank", org="World Bank"))
        time.sleep(1)
    except Exception as e:
        print(f"World Bank error: {e}")
    return results

def search_reliefweb(query, from_year=1990):
    results = []
    try:
        payload = {
            "appname": "sbc-promise-tracker",
            "query": {"value": query, "fields": ["title", "body"]},
            "filter": {
                "operator": "AND",
                "conditions": [
                    {"field": "date.created", "value": {"from": f"{from_year}-01-01T00:00:00+00:00"}},
                    {"field": "format.name", "value": ["Evaluation and Lessons Learned", "Assessment", "Analysis", "Policy Document"]}
                ]
            },
            "fields": {"include": ["title", "url", "date", "source", "file"]},
            "limit": 50,
            "sort": ["score:desc"]
        }
        r = requests.post(RELIEFWEB_BASE, json=payload, timeout=30)
        if r.status_code == 200:
            for item in r.json().get("data", []):
                fields = item.get("fields", {})
                files = fields.get("file", [{}])
                url = files[0].get("url") if files else fields.get("url")
                if url:
                    year = (fields.get("date", {}).get("created") or "")[:4] or None
                    results.append(make_entry(fields.get("title", ""), url, year, "ReliefWeb"))
        time.sleep(1)
    except Exception as e:
        print(f"ReliefWeb error: {e}")
    return results

def run_scout(day_zero=False):
    seen_urls = load_seen_urls()
    all_found = []
    from_year = 1990 if day_zero else 2024

    # OpenAlex + CORE for all main queries
    for query in SEARCH_QUERIES:
        for result in search_openalex(query, from_year) + search_core(query, from_year):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # PubMed
    for query in PUBMED_QUERIES:
        for result in search_pubmed(query, from_year):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # Europe PMC + Semantic Scholar (subset of queries to manage rate limits)
    for query in SEARCH_QUERIES[:5]:
        for result in search_europepmc(query, from_year) + search_semanticscholar(query, from_year):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # World Bank
    for query in SEARCH_QUERIES[:6]:
        for result in search_worldbank(query, from_year):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # ReliefWeb
    for query in RELIEFWEB_QUERIES:
        for result in search_reliefweb(query, from_year):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # WHO IRIS
    for query in WHO_IRIS_QUERIES:
        for result in search_who_iris(query):
            if result["url"] and result["url"] not in seen_urls:
                all_found.append(result)
                seen_urls.add(result["url"])

    # Always save the updated seen list (even if nothing new found, so we don't re-check)
    save_seen_urls(seen_urls)
    print(f"Scout: {len(all_found)} unique new documents across all sources")
    return all_found
