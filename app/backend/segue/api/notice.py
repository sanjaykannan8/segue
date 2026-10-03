"""The privacy notice shown before any data is taken. Versioned: the version is stored with each consent.
The wording is a plain-language draft. Have it reviewed by a lawyer before a public launch."""
from ..core.settings import get_settings
from ..privacy.service import PURPOSES

TEXT = {
    "en": {
        "title": "Before we start: your data",
        "intro": "Segue watches your flight connection and helps you make it. To do that we need a small amount of your data. Here is exactly what, why, and for how long.",
        "sections": [
            ("What we collect", "Your two flight numbers and your seat. Optionally your name, a phone number, your language, and an assistance need if you choose to tell us. We do not collect your passport, your booking reference or a picture of your boarding pass."),
            ("Why", "To work out whether you will make your connection, tell you early, and let the airline's staff help you in time. Each use below is separate, and you choose which ones to allow."),
            ("Who sees it", "The airline's operations team, cabin crew and ground staff see your seat and connection. Your assistance need is shown only to those three groups. The airport or immigration authority sees your name and flights only if you allow a fast-track request."),
            ("How long", "Everything personal is deleted automatically {hours} hours after your onward flight departs. You can delete it sooner at any time."),
            ("Your rights", "You can see, download, correct or delete your data, withdraw any consent, name a person to act for you, and raise a complaint, all from the Privacy page. If you are not satisfied with our answer you may complain to the Data Protection Board of India."),
            ("Contact", "Questions or complaints: {contact}."),
        ],
    },
    "hi": {
        "title": "शुरू करने से पहले: आपका डेटा",
        "intro": "Segue आपके फ़्लाइट कनेक्शन पर नज़र रखता है और उसे पकड़ने में मदद करता है। इसके लिए हमें आपके थोड़े से डेटा की ज़रूरत है। यहाँ बताया गया है कि क्या, क्यों और कितने समय के लिए।",
        "sections": [
            ("हम क्या लेते हैं", "आपकी दो फ़्लाइट संख्याएँ और आपकी सीट। चाहें तो आपका नाम, फ़ोन नंबर, भाषा और सहायता की ज़रूरत। हम आपका पासपोर्ट, बुकिंग रेफ़रेंस या बोर्डिंग पास की तस्वीर नहीं लेते।"),
            ("क्यों", "यह जानने के लिए कि आप अपना कनेक्शन पकड़ पाएंगे या नहीं, आपको समय रहते बताने के लिए, और एयरलाइन के कर्मचारियों को समय पर मदद करने देने के लिए। नीचे हर उपयोग अलग है, और आप चुनते हैं कि किसकी अनुमति देनी है।"),
            ("कौन देखता है", "एयरलाइन की ऑपरेशंस टीम, केबिन क्रू और ग्राउंड स्टाफ़ आपकी सीट और कनेक्शन देखते हैं। आपकी सहायता की ज़रूरत सिर्फ़ इन्हीं तीन समूहों को दिखती है। हवाई अड्डा या इमिग्रेशन प्राधिकरण आपका नाम और फ़्लाइट तभी देखता है जब आप फ़ास्ट-ट्रैक अनुरोध की अनुमति दें।"),
            ("कितने समय तक", "आपकी आगे की फ़्लाइट के रवाना होने के {hours} घंटे बाद सारा निजी डेटा अपने आप मिट जाता है। आप इसे पहले भी कभी भी मिटा सकते हैं।"),
            ("आपके अधिकार", "आप अपना डेटा देख, डाउनलोड, सुधार या मिटा सकते हैं, कोई भी सहमति वापस ले सकते हैं, अपनी ओर से किसी को नामित कर सकते हैं और शिकायत कर सकते हैं, यह सब Privacy पेज से। हमारे जवाब से संतुष्ट न हों तो आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।"),
            ("संपर्क", "सवाल या शिकायत: {contact}."),
        ],
    },
}


def notice(lang: str) -> dict:
    s = get_settings()
    text = TEXT.get(lang, TEXT["en"])
    fill = lambda body: body.format(hours=s.retention_hours, contact=s.grievance_contact)
    return {
        "version": s.notice_version,
        "lang": lang if lang in TEXT else "en",
        "title": text["title"],
        "intro": text["intro"],
        "sections": [{"heading": heading, "body": fill(body)} for heading, body in text["sections"]],
        "purposes": [{"id": pid, "title": title, "description": description, "required": required} for pid, (title, description, required) in PURPOSES.items()],
        "retention_hours": s.retention_hours,
        "grievance_contact": s.grievance_contact,
    }
