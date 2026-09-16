import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
en = json.loads((root / "i18n-en.json").read_text(encoding="utf-8"))
print("en json keys", len(en))

pub = (root / "i18n-public.js").read_text(encoding="utf-8")
pub_en = pub.split("  hi:")[0]
keys = re.findall(r"^    ([A-Za-z0-9_]+):", pub_en, re.M)
print("public en keys", len(keys), "unique", len(set(keys)))
missing_in_json = [k for k in keys if k not in en]
print("public keys not in json", missing_in_json)

for name in ["bn", "gu", "kn", "ta", "te", "pa", "ml", "as", "ur"]:
    p = root / "i18n-locales" / f"{name}.js"
    if not p.exists():
        print(name, "MISSING FILE")
        continue
    text = p.read_text(encoding="utf-8")
    k = re.findall(r"^  ([A-Za-z0-9_]+):", text, re.M)
    missing = [x for x in keys if x not in set(k)]
    extra = [x for x in k if x not in set(keys)]
    print(f"{name}: keys={len(k)} unique={len(set(k))} missing_vs_public={len(missing)} extra={extra[:8]} missing={missing[:12]}")
