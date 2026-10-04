"""The privacy notice shown before any data is taken. Versioned: the version is stored with each consent.

English is the source text. It is a plain-language draft: have a lawyer review it before a public
launch. The Arabic, Hindi and Tamil versions were written without a native reviewer and must be
checked by one; until then the English text is the one that governs.
"""
from ..core.settings import get_settings
from ..privacy.service import PURPOSES

TEXT = {
    "en": {
        "title": "Before we start: your data",
        "intro": "Segue watches your flight connection at Dubai International and helps you make it. To do that we need a small amount of your data. Here is exactly what, why, and for how long.",
        "sections": [
            ("What we collect", "Your two flight numbers and your seat. Optionally your name, an email address, a phone number, your language, and an assistance need if you choose to tell us. We do not collect your passport, your booking reference or a picture of your boarding pass."),
            ("Why", "To work out whether you will make your connection, tell you early, and let the airline's staff help you in time. Each use below is separate, and you choose which ones to allow."),
            ("Who sees it", "The airline's operations team, cabin crew and ground staff see your seat and connection, and your name only in masked form (for example P***a S****a). Your assistance need is shown only to those three groups. The airport authority sees your masked name and flights only if you allow a fast-track request."),
            ("How long", "Everything personal is deleted automatically {hours} hours after your onward flight departs. You can delete it sooner at any time."),
            ("Your rights", "You can see, download, correct or delete your data, withdraw any consent, name a person to act for you, and raise a complaint, all from the Your data page. If you are not satisfied with our answer you may complain to the Data Protection Board of India."),
            ("Contact", "Questions or complaints: {contact}."),
        ],
        "purposes": {
            "tracking": ("Track my connection", "Use my two flights and seat to score my connection and show it to me and to the airline's operations team."),
            "notifications": ("Send me updates", "Show me alerts about my connection in this app, and email them to me if I give an address."),
            "assistance": ("Use my assistance need", "Use the assistance need I declare to arrange help. Shared only with operations, cabin crew and ground staff."),
            "authority_share": ("Ask the airport for fast-track", "Share my masked name, flights and connection deadline with the airport authority to request a faster lane. They decide."),
        },
    },
    "ar": {
        "title": "قبل أن نبدأ: بياناتك",
        "intro": "يتابع Segue رحلة الربط الخاصة بك في مطار دبي الدولي ويساعدك على اللحاق بها. لذلك نحتاج إلى قدر قليل من بياناتك. إليك بالضبط ما نأخذه، ولماذا، وإلى متى.",
        "sections": [
            ("ما الذي نجمعه", "رقما رحلتيك ورقم مقعدك. واختيارياً اسمك، وبريدك الإلكتروني، ورقم هاتفك، ولغتك، وحاجتك إلى المساعدة إن اخترت إخبارنا بها. لا نجمع جواز سفرك ولا مرجع حجزك ولا صورة بطاقة الصعود."),
            ("لماذا", "لمعرفة ما إذا كنت ستلحق برحلة الربط، وإبلاغك مبكراً، وتمكين موظفي شركة الطيران من مساعدتك في الوقت المناسب. كل استخدام أدناه مستقل، وأنت تختار ما تسمح به."),
            ("من يطّلع عليها", "يرى فريق العمليات وطاقم المقصورة وموظفو الخدمات الأرضية مقعدك ورحلة الربط، ويرون اسمك بشكل مخفي فقط (مثل P***a S****a). حاجتك إلى المساعدة تظهر لهذه الفئات الثلاث فقط. سلطة المطار ترى اسمك المخفي ورحلتيك فقط إذا سمحت بطلب المسار السريع."),
            ("إلى متى", "تُحذف كل البيانات الشخصية تلقائياً بعد {hours} ساعة من إقلاع رحلتك التالية. يمكنك حذفها قبل ذلك في أي وقت."),
            ("حقوقك", "يمكنك الاطلاع على بياناتك وتنزيلها وتصحيحها وحذفها، وسحب أي موافقة، وتعيين شخص ينوب عنك، وتقديم شكوى، كل ذلك من صفحة بياناتك. إذا لم تقتنع بردّنا يمكنك تقديم شكوى إلى مجلس حماية البيانات في الهند."),
            ("التواصل", "للأسئلة أو الشكاوى: {contact}."),
        ],
        "purposes": {
            "tracking": ("تتبّع رحلة الربط", "استخدام رحلتيّ ومقعدي لتقييم رحلة الربط وعرضها لي ولفريق عمليات شركة الطيران."),
            "notifications": ("إرسال التحديثات لي", "عرض تنبيهات رحلة الربط في هذا التطبيق، وإرسالها إلى بريدي الإلكتروني إن قدّمته."),
            "assistance": ("استخدام حاجتي إلى المساعدة", "استخدام حاجة المساعدة التي أصرّح بها لترتيب العون. تُشارك فقط مع العمليات وطاقم المقصورة وموظفي الخدمات الأرضية."),
            "authority_share": ("طلب المسار السريع من المطار", "مشاركة اسمي المخفي ورحلتيّ وموعد رحلة الربط مع سلطة المطار لطلب مسار أسرع. القرار لهم."),
        },
    },
    "hi": {
        "title": "शुरू करने से पहले: आपका डेटा",
        "intro": "Segue दुबई इंटरनेशनल पर आपके फ़्लाइट कनेक्शन पर नज़र रखता है और उसे पकड़ने में मदद करता है। इसके लिए हमें आपके थोड़े से डेटा की ज़रूरत है। यहाँ बताया गया है कि क्या, क्यों और कितने समय के लिए।",
        "sections": [
            ("हम क्या लेते हैं", "आपकी दो फ़्लाइट संख्याएँ और आपकी सीट। चाहें तो आपका नाम, ईमेल पता, फ़ोन नंबर, भाषा और सहायता की ज़रूरत। हम आपका पासपोर्ट, बुकिंग रेफ़रेंस या बोर्डिंग पास की तस्वीर नहीं लेते।"),
            ("क्यों", "यह जानने के लिए कि आप अपना कनेक्शन पकड़ पाएंगे या नहीं, आपको समय रहते बताने के लिए, और एयरलाइन के कर्मचारियों को समय पर मदद करने देने के लिए। नीचे हर उपयोग अलग है, और आप चुनते हैं कि किसकी अनुमति देनी है।"),
            ("कौन देखता है", "एयरलाइन की ऑपरेशंस टीम, केबिन क्रू और ग्राउंड स्टाफ़ आपकी सीट और कनेक्शन देखते हैं, और आपका नाम केवल छिपे रूप में (जैसे P***a S****a)। आपकी सहायता की ज़रूरत सिर्फ़ इन्हीं तीन समूहों को दिखती है। हवाई अड्डा प्राधिकरण आपका छिपा नाम और फ़्लाइट तभी देखता है जब आप फ़ास्ट-ट्रैक अनुरोध की अनुमति दें।"),
            ("कितने समय तक", "आपकी आगे की फ़्लाइट के रवाना होने के {hours} घंटे बाद सारा निजी डेटा अपने आप मिट जाता है। आप इसे पहले भी कभी भी मिटा सकते हैं।"),
            ("आपके अधिकार", "आप अपना डेटा देख, डाउनलोड, सुधार या मिटा सकते हैं, कोई भी सहमति वापस ले सकते हैं, अपनी ओर से किसी को नामित कर सकते हैं और शिकायत कर सकते हैं, यह सब 'आपका डेटा' पेज से। हमारे जवाब से संतुष्ट न हों तो आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।"),
            ("संपर्क", "सवाल या शिकायत: {contact}."),
        ],
        "purposes": {
            "tracking": ("मेरे कनेक्शन पर नज़र रखें", "मेरी दो फ़्लाइट और सीट का उपयोग कनेक्शन का आकलन करने और उसे मुझे तथा एयरलाइन की ऑपरेशंस टीम को दिखाने के लिए करें।"),
            "notifications": ("मुझे अपडेट भेजें", "इस ऐप में मेरे कनेक्शन की सूचनाएँ दिखाएँ, और ईमेल पता देने पर ईमेल भी करें।"),
            "assistance": ("मेरी सहायता की ज़रूरत का उपयोग करें", "मेरी बताई सहायता की ज़रूरत का उपयोग मदद की व्यवस्था के लिए करें। केवल ऑपरेशंस, केबिन क्रू और ग्राउंड स्टाफ़ के साथ साझा।"),
            "authority_share": ("हवाई अड्डे से फ़ास्ट-ट्रैक माँगें", "तेज़ लेन का अनुरोध करने के लिए मेरा छिपा नाम, फ़्लाइट और कनेक्शन की समय-सीमा हवाई अड्डा प्राधिकरण के साथ साझा करें। निर्णय उनका है।"),
        },
    },
    "ta": {
        "title": "தொடங்கும் முன்: உங்கள் தரவு",
        "intro": "Segue துபாய் சர்வதேச விமான நிலையத்தில் உங்கள் இணைப்பு விமானத்தைக் கவனித்து, அதைப் பிடிக்க உதவுகிறது. அதற்கு உங்கள் தரவில் சிறிதளவு தேவை. எது, ஏன், எவ்வளவு காலம் என்பது இங்கே.",
        "sections": [
            ("நாங்கள் சேகரிப்பது", "உங்கள் இரண்டு விமான எண்கள் மற்றும் இருக்கை. விருப்பமிருந்தால் உங்கள் பெயர், மின்னஞ்சல் முகவரி, தொலைபேசி எண், மொழி, மற்றும் உதவித் தேவை. உங்கள் கடவுச்சீட்டு, முன்பதிவு எண் அல்லது போர்டிங் பாஸின் படத்தை நாங்கள் சேகரிப்பதில்லை."),
            ("ஏன்", "நீங்கள் இணைப்பு விமானத்தைப் பிடிப்பீர்களா என்பதைக் கணிக்கவும், முன்கூட்டியே தெரிவிக்கவும், விமான நிறுவன ஊழியர்கள் சரியான நேரத்தில் உதவவும். கீழே உள்ள ஒவ்வொரு பயன்பாடும் தனித்தனி; எதை அனுமதிப்பது என்பதை நீங்களே தேர்வு செய்கிறீர்கள்."),
            ("யார் பார்க்கிறார்கள்", "விமான நிறுவனத்தின் செயல்பாட்டுக் குழு, விமானப் பணியாளர்கள் மற்றும் தரைப் பணியாளர்கள் உங்கள் இருக்கையையும் இணைப்பையும் பார்க்கிறார்கள்; உங்கள் பெயரை மறைக்கப்பட்ட வடிவில் மட்டுமே (எ.கா. P***a S****a). உங்கள் உதவித் தேவை இந்த மூன்று குழுக்களுக்கு மட்டுமே காட்டப்படும். விரைவுப் பாதை கோரிக்கையை நீங்கள் அனுமதித்தால் மட்டுமே விமான நிலைய அதிகாரம் உங்கள் மறைக்கப்பட்ட பெயரையும் விமானங்களையும் பார்க்கும்."),
            ("எவ்வளவு காலம்", "உங்கள் அடுத்த விமானம் புறப்பட்ட {hours} மணி நேரத்திற்குப் பிறகு தனிப்பட்ட தரவு அனைத்தும் தானாக நீக்கப்படும். அதற்கு முன்பும் எப்போது வேண்டுமானாலும் நீக்கலாம்."),
            ("உங்கள் உரிமைகள்", "உங்கள் தரவைப் பார்க்க, பதிவிறக்க, திருத்த அல்லது நீக்க, எந்த ஒப்புதலையும் திரும்பப் பெற, உங்களுக்காகச் செயல்பட ஒருவரை நியமிக்க, புகார் அளிக்க முடியும்; இவை அனைத்தும் 'உங்கள் தரவு' பக்கத்தில். எங்கள் பதிலில் திருப்தி இல்லையெனில் இந்திய தரவுப் பாதுகாப்பு வாரியத்திடம் புகார் அளிக்கலாம்."),
            ("தொடர்பு", "கேள்விகள் அல்லது புகார்கள்: {contact}."),
        ],
        "purposes": {
            "tracking": ("என் இணைப்பைக் கண்காணிக்கவும்", "என் இரண்டு விமானங்களையும் இருக்கையையும் பயன்படுத்தி இணைப்பை மதிப்பிட்டு, எனக்கும் விமான நிறுவன செயல்பாட்டுக் குழுவுக்கும் காட்டவும்."),
            "notifications": ("எனக்குப் புதுப்பிப்புகளை அனுப்பவும்", "என் இணைப்பு குறித்த அறிவிப்புகளை இந்தச் செயலியில் காட்டவும்; மின்னஞ்சல் முகவரி கொடுத்தால் மின்னஞ்சலிலும் அனுப்பவும்."),
            "assistance": ("என் உதவித் தேவையைப் பயன்படுத்தவும்", "நான் தெரிவிக்கும் உதவித் தேவையைப் பயன்படுத்தி உதவியை ஏற்பாடு செய்யவும். செயல்பாட்டுக் குழு, விமானப் பணியாளர்கள், தரைப் பணியாளர்களுடன் மட்டுமே பகிரப்படும்."),
            "authority_share": ("விமான நிலையத்திடம் விரைவுப் பாதை கேட்கவும்", "விரைவான வரிசையைக் கோர, என் மறைக்கப்பட்ட பெயர், விமானங்கள் மற்றும் இணைப்பு நேரத்தை விமான நிலைய அதிகாரத்துடன் பகிரவும். முடிவு அவர்களுடையது."),
        },
    },
}


def notice(lang: str) -> dict:
    s = get_settings()
    language = lang if lang in TEXT else "en"
    text = TEXT[language]
    fill = lambda body: body.format(hours=s.retention_hours, contact=s.grievance_contact)
    return {
        "version": s.notice_version,
        "lang": language,
        "dir": "rtl" if language == "ar" else "ltr",
        "title": text["title"],
        "intro": text["intro"],
        "sections": [{"heading": heading, "body": fill(body)} for heading, body in text["sections"]],
        "purposes": [{"id": pid, "title": text["purposes"][pid][0], "description": text["purposes"][pid][1], "required": required} for pid, (_, _, required) in PURPOSES.items()],
        "retention_hours": s.retention_hours,
        "grievance_contact": s.grievance_contact,
    }
