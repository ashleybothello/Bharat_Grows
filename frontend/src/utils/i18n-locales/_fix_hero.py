from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
heroes = {
    "en": ("Pride of Bharat,", "the farmer's smile."),
    "hi": ("Bharat की शान,", "किसान की मुस्कान।"),
    "mr": ("भारताची शान,", "शेतकऱ्यांची हासक."),
    "bn": ("ভারতের গৌরব,", "কৃষকের হাসি।"),
    "gu": ("ભારતની શાન,", "ખેડૂતની મુસ્કાન."),
    "pa": ("ਭਾਰਤ ਦੀ ਸ਼ਾਨ,", "ਕਿਸਾਨ ਦੀ ਮੁਸਕਾਨ।"),
    "ta": ("பாரதத்தின் பெருமை,", "விவசாயியின் புன்னகை."),
    "te": ("భారత గర్వం,", "రైతు నవ్వు."),
    "kn": ("ಭಾರತದ ಹೆಮ್ಮೆ,", "ರೈತನ ನಗು."),
    "ml": ("ഭാരതത്തിന്റെ മാനം,", "കർഷകന്റെ പുഞ്ചിരി."),
    "or": ("ଭାରତର ଗୌରବ,", "କୃଷକଙ୍କ ହସ।"),
    "as": ("ভাৰতৰ গৌৰৱ,", "খেতিয়কৰ হাঁহি।"),
    "ur": ("بھارت کی شان،", "کسان کی مسکراہٹ۔"),
}

old1 = "lp_hero_line1: 'Bharat की शान,'"
old2 = "lp_hero_line2: 'किसान की मुस्कान।'"

for code, (line1, line2) in heroes.items():
    path = root / "i18n-locales" / f"{code}.js"
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    text = text.replace(old1, "lp_hero_line1: " + json.dumps(line1, ensure_ascii=False) + ",")
    text = text.replace(old2, "lp_hero_line2: " + json.dumps(line2, ensure_ascii=False) + ",")
    path.write_text(text, encoding="utf-8")
    print("locale", code)

pub_path = root / "i18n-public.js"
text = pub_path.read_text(encoding="utf-8")


def sub_nth(source, old, new, n):
    start = 0
    found = -1
    for _ in range(n + 1):
        found = source.find(old, start)
        if found < 0:
            return source
        start = found + len(old)
    return source[:found] + new + source[found + len(old):]


for idx, code in enumerate(("en", "hi", "mr")):
    line1, line2 = heroes[code]
    text = sub_nth(text, old1, "lp_hero_line1: " + json.dumps(line1, ensure_ascii=False) + ",", idx)
    text = sub_nth(text, old2, "lp_hero_line2: " + json.dumps(line2, ensure_ascii=False) + ",", idx)

pub_path.write_text(text, encoding="utf-8")
print("public leftover hindi", text.count("Bharat की शान"), text.count("किसान की मुस्कान"))

enj = root / "i18n-en.json"
if enj.exists():
    data = json.loads(enj.read_text(encoding="utf-8"))
    data["lp_hero_line1"] = heroes["en"][0]
    data["lp_hero_line2"] = heroes["en"][1]
    enj.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("json updated")
