"""Passenger messages. clef-flash picks the template; the words are written here, per language.

English is the source. The Arabic, Hindi and Tamil texts were written without a native reviewer
and must be checked by one before real passengers see them.
"""

LANGUAGES = ("en", "ar", "hi", "ta")
RTL = ("ar",)

TEMPLATES = {
    "en": {
        "on_track": ("You're on track", "Your connection to {dest} on {outbound} looks fine. We'll tell you if anything changes."),
        "hurry": ("Head straight to your gate", "Your connection to {dest} on {outbound} is tight. Go directly to gate {gate} when you land."),
        "called_off_first": ("You'll be called off first", "Stay in seat {seat} until the crew calls you. Then go straight to gate {gate}."),
        "assistance_coming": ("Help is on its way", "Assistance will meet you at the aircraft door and take you to gate {gate}."),
        "rebooked": ("We're arranging another flight", "Your connection on {outbound} cannot be made. The airline is arranging a new flight; no need to queue."),
        "self_transfer_hurry": ("Tight, and on separate tickets", "Your flights are on separate bookings. Collect your bag, check in again for {outbound} and clear security. Go as soon as you land."),
        "self_transfer_missed": ("You may miss {outbound}", "Your flights are on separate bookings, so the airline will not rebook you automatically. Contact the airline for {outbound} now to change your flight."),
    },
    "ar": {
        "on_track": ("رحلتك تسير كما يجب", "رحلة الربط إلى {dest} على {outbound} تبدو جيدة. سنخبرك إذا تغيّر أي شيء."),
        "hurry": ("توجّه مباشرة إلى بوابتك", "الوقت ضيق لرحلة الربط إلى {dest} على {outbound}. توجّه مباشرة إلى البوابة {gate} عند الهبوط."),
        "called_off_first": ("ستنزل من الطائرة أولاً", "ابقَ في المقعد {seat} حتى يناديك الطاقم، ثم توجّه مباشرة إلى البوابة {gate}."),
        "assistance_coming": ("المساعدة في الطريق", "سيستقبلك فريق المساعدة عند باب الطائرة ويرافقك إلى البوابة {gate}."),
        "rebooked": ("نرتّب لك رحلة أخرى", "لا يمكن اللحاق برحلة الربط {outbound}. شركة الطيران ترتّب لك رحلة جديدة، ولا حاجة للوقوف في الطابور."),
        "self_transfer_hurry": ("الوقت ضيق والتذاكر منفصلة", "رحلتاك على حجزين منفصلين. استلم حقيبتك، وسجّل من جديد لرحلة {outbound}، ثم اعبر التفتيش الأمني. تحرّك فور الهبوط."),
        "self_transfer_missed": ("قد تفوتك رحلة {outbound}", "رحلتاك على حجزين منفصلين، لذلك لن تعيد شركة الطيران حجزك تلقائياً. تواصل الآن مع شركة طيران الرحلة {outbound} لتغيير رحلتك."),
    },
    "hi": {
        "on_track": ("आप समय पर हैं", "{dest} के लिए {outbound} का आपका कनेक्शन ठीक है। कुछ बदलने पर हम बताएंगे।"),
        "hurry": ("सीधे अपने गेट पर जाएं", "{dest} के लिए {outbound} का आपका कनेक्शन कम समय का है। उतरते ही सीधे गेट {gate} पर जाएं।"),
        "called_off_first": ("आपको पहले उतारा जाएगा", "क्रू के बुलाने तक सीट {seat} पर रहें। फिर सीधे गेट {gate} पर जाएं।"),
        "assistance_coming": ("मदद आ रही है", "सहायता विमान के दरवाज़े पर मिलेगी और आपको गेट {gate} तक ले जाएगी।"),
        "rebooked": ("हम दूसरी उड़ान की व्यवस्था कर रहे हैं", "{outbound} का आपका कनेक्शन संभव नहीं है। एयरलाइन नई उड़ान की व्यवस्था कर रही है।"),
        "self_transfer_hurry": ("समय कम है, और टिकट अलग-अलग हैं", "आपकी उड़ानें अलग बुकिंग पर हैं। अपना बैग लें, {outbound} के लिए दोबारा चेक-इन करें और सुरक्षा जांच पार करें। उतरते ही निकलें।"),
        "self_transfer_missed": ("{outbound} छूट सकती है", "आपकी उड़ानें अलग बुकिंग पर हैं, इसलिए एयरलाइन अपने आप दोबारा बुकिंग नहीं करेगी। उड़ान बदलने के लिए {outbound} की एयरलाइन से अभी संपर्क करें।"),
    },
    "ta": {
        "on_track": ("உங்கள் பயணம் சரியாக உள்ளது", "{dest} செல்லும் {outbound} இணைப்பு விமானத்திற்கு போதுமான நேரம் உள்ளது. ஏதேனும் மாறினால் தெரிவிப்போம்."),
        "hurry": ("நேராக உங்கள் வாயிலுக்குச் செல்லுங்கள்", "{dest} செல்லும் {outbound} இணைப்புக்கு நேரம் குறைவாக உள்ளது. இறங்கியவுடன் நேராக வாயில் {gate}-க்குச் செல்லுங்கள்."),
        "called_off_first": ("உங்களை முதலில் இறக்குவார்கள்", "பணியாளர்கள் அழைக்கும் வரை இருக்கை {seat}-இல் இருங்கள். பிறகு நேராக வாயில் {gate}-க்குச் செல்லுங்கள்."),
        "assistance_coming": ("உதவி வந்துகொண்டிருக்கிறது", "உதவியாளர் விமானக் கதவருகில் உங்களைச் சந்தித்து வாயில் {gate}-க்கு அழைத்துச் செல்வார்."),
        "rebooked": ("வேறு விமானத்தை ஏற்பாடு செய்கிறோம்", "{outbound} இணைப்பு விமானத்தைப் பிடிக்க முடியாது. விமான நிறுவனம் புதிய விமானத்தை ஏற்பாடு செய்கிறது; வரிசையில் நிற்க வேண்டாம்."),
        "self_transfer_hurry": ("நேரம் குறைவு, பயணச்சீட்டுகள் தனித்தனி", "உங்கள் விமானங்கள் தனித்தனி முன்பதிவுகளில் உள்ளன. உங்கள் பையை எடுத்து, {outbound}-க்கு மீண்டும் செக்-இன் செய்து, பாதுகாப்புச் சோதனையைக் கடக்கவும். இறங்கியவுடன் புறப்படுங்கள்."),
        "self_transfer_missed": ("{outbound} விமானத்தைத் தவறவிடலாம்", "உங்கள் விமானங்கள் தனித்தனி முன்பதிவுகளில் உள்ளதால், விமான நிறுவனம் தானாக மறுமுன்பதிவு செய்யாது. விமானத்தை மாற்ற {outbound} விமான நிறுவனத்தை இப்போதே தொடர்பு கொள்ளுங்கள்."),
    },
}

# The words around the message in an email.
EMAIL = {
    "en": {"subject": "Segue: {title}", "route": "Your route at Dubai International", "minutes": "About {minutes} minutes: {how}.", "official": "Open the official Dubai Airports transfer guide", "why": "You get this because you asked Segue for updates on this connection.", "privacy": "Your data is deleted {hours} hours after your onward flight departs. Manage it in the app under Your data."},
    "ar": {"subject": "Segue: {title}", "route": "مسارك في مطار دبي الدولي", "minutes": "حوالي {minutes} دقيقة: {how}.", "official": "افتح دليل التحويل الرسمي لمطارات دبي", "why": "تصلك هذه الرسالة لأنك طلبت من Segue تحديثات عن رحلة الربط هذه.", "privacy": "تُحذف بياناتك بعد {hours} ساعة من إقلاع رحلتك التالية. يمكنك إدارتها في التطبيق من صفحة بياناتك."},
    "hi": {"subject": "Segue: {title}", "route": "दुबई इंटरनेशनल पर आपका रास्ता", "minutes": "लगभग {minutes} मिनट: {how}.", "official": "दुबई एयरपोर्ट्स की आधिकारिक ट्रांसफ़र गाइड खोलें", "why": "यह संदेश आपको इसलिए मिला क्योंकि आपने Segue से इस कनेक्शन के अपडेट मांगे थे।", "privacy": "आपकी आगे की उड़ान के {hours} घंटे बाद आपका डेटा मिटा दिया जाता है। ऐप में 'आपका डेटा' से इसे संभालें।"},
    "ta": {"subject": "Segue: {title}", "route": "துபாய் சர்வதேச விமான நிலையத்தில் உங்கள் வழி", "minutes": "சுமார் {minutes} நிமிடங்கள்: {how}.", "official": "துபாய் விமான நிலையங்களின் அதிகாரப்பூர்வ இணைப்பு வழிகாட்டியைத் திறக்கவும்", "why": "இந்த இணைப்புப் பயணம் குறித்த புதுப்பிப்புகளை Segue-இடம் கேட்டதால் இந்தச் செய்தி உங்களுக்கு வருகிறது.", "privacy": "உங்கள் அடுத்த விமானம் புறப்பட்ட {hours} மணி நேரத்திற்குப் பிறகு உங்கள் தரவு நீக்கப்படும். செயலியில் 'உங்கள் தரவு' பகுதியில் அதை நிர்வகிக்கலாம்."},
}


def render(template: str, language: str, variables: dict) -> tuple[str, str]:
    title, body = TEMPLATES.get(language, TEMPLATES["en"]).get(template, TEMPLATES["en"]["on_track"])
    safe = {key: (value if value not in (None, "") else "—") for key, value in variables.items()}
    for key in ("dest", "outbound", "gate", "seat"):
        safe.setdefault(key, "—")
    return title.format(**safe), body.format(**safe)
