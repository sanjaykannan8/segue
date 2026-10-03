"""Passenger messages. clef-flash picks the template; the words are written here, per language."""

TEMPLATES = {
    "en": {
        "on_track": ("You're on track", "Your connection to {dest} on {outbound} looks fine. We'll tell you if anything changes."),
        "hurry": ("Head straight to your gate", "Your connection to {dest} on {outbound} is tight. Go directly to gate {gate} when you land."),
        "called_off_first": ("You'll be called off first", "Stay in seat {seat} until the crew calls you. Then go straight to gate {gate}."),
        "assistance_coming": ("Help is on its way", "Assistance will meet you at the aircraft door and take you to gate {gate}."),
        "rebooked": ("We're arranging another flight", "Your connection on {outbound} cannot be made. The airline is arranging a new flight; no need to queue."),
    },
    "hi": {
        "on_track": ("आप समय पर हैं", "{dest} के लिए {outbound} का आपका कनेक्शन ठीक है। कुछ बदलने पर हम बताएंगे।"),
        "hurry": ("सीधे अपने गेट पर जाएं", "{dest} के लिए {outbound} का आपका कनेक्शन कम समय का है। उतरते ही सीधे गेट {gate} पर जाएं।"),
        "called_off_first": ("आपको पहले उतारा जाएगा", "क्रू के बुलाने तक सीट {seat} पर रहें। फिर सीधे गेट {gate} पर जाएं।"),
        "assistance_coming": ("मदद आ रही है", "सहायता विमान के दरवाज़े पर मिलेगी और आपको गेट {gate} तक ले जाएगी।"),
        "rebooked": ("हम दूसरी उड़ान की व्यवस्था कर रहे हैं", "{outbound} का आपका कनेक्शन संभव नहीं है। एयरलाइन नई उड़ान की व्यवस्था कर रही है।"),
    },
}


def render(template: str, language: str, variables: dict) -> tuple[str, str]:
    title, body = TEMPLATES.get(language, TEMPLATES["en"]).get(template, TEMPLATES["en"]["on_track"])
    safe = {key: (value if value not in (None, "") else "—") for key, value in variables.items()}
    for key in ("dest", "outbound", "gate", "seat"):
        safe.setdefault(key, "—")
    return title, body.format(**safe)
