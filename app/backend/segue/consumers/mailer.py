"""The passenger's alert as an email, with a vector map of their route at Dubai International.

By default mail goes to the Mailpit container: a local test inbox, nothing leaves the machine.
Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in .env to send through a real provider instead.

The map is attached as SVG (the vector original) and shown inline as PNG, because most mail
apps do not draw SVG. If the PNG renderer is missing the email still goes, with the SVG attached.
"""
import hashlib
import logging
from email.message import EmailMessage
from email.headerregistry import Address
from email.utils import formataddr, parseaddr
from html import escape

import aiosmtplib

from ..core.breaker import Breaker
from ..core.buffer import Transfer
from ..core.bus import redis
from ..core.dxbmap import route_map_svg, svg_to_png
from ..core.settings import get_settings
from .templates import EMAIL, RTL

log = logging.getLogger("segue.mail")
DEEP, OCEAN, MIST, MUTED = "#06283D", "#1363DF", "#DFF6FF", "#5B7385"


VERIFY = {
    "en": ("Segue: confirm your email", "Your Segue code is {code}. Type it into Segue to get your connection alerts by email. It works for 15 minutes. If you did not ask for this, ignore this email: nothing will be sent to you."),
    "ar": ("Segue: أكّد بريدك الإلكتروني", "رمز Segue الخاص بك هو {code}. اكتبه في Segue لتصلك تنبيهات رحلتك بالبريد الإلكتروني. يصلح لمدة 15 دقيقة. إذا لم تطلب ذلك فتجاهل هذه الرسالة ولن يُرسل إليك شيء."),
    "hi": ("Segue: अपना ईमेल पुष्टि करें", "आपका Segue कोड {code} है। ईमेल पर कनेक्शन अलर्ट पाने के लिए इसे Segue में लिखें। यह 15 मिनट तक चलेगा। अगर आपने यह नहीं माँगा, तो इस ईमेल को अनदेखा करें: आपको कुछ नहीं भेजा जाएगा।"),
    "ta": ("Segue: உங்கள் மின்னஞ்சலை உறுதிப்படுத்துங்கள்", "உங்கள் Segue குறியீடு {code}. இணைப்பு எச்சரிக்கைகளை மின்னஞ்சலில் பெற இதை Segue-இல் உள்ளிடுங்கள். இது 15 நிமிடங்கள் செல்லும். நீங்கள் இதைக் கேட்கவில்லை என்றால் இந்த மின்னஞ்சலைப் புறக்கணியுங்கள்: உங்களுக்கு எதுவும் அனுப்பப்படாது."),
}


def address_mark(address: str) -> str:
    """A fingerprint of an address, so Redis keys and markers never hold the address itself."""
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()[:24]


async def mail_allowed(address: str) -> bool:
    """A cap per address per hour, whatever asks for the mail."""
    key = "mail:" + address_mark(address)
    count = await redis().incr(key)
    if count == 1:
        await redis().expire(key, 3600)
    return count <= get_settings().mail_per_address_per_hour


def _recipient(to: str) -> Address:
    local, _, domain = to.rpartition("@")
    return Address(username=local, domain=domain)  # exactly one recipient, whatever the text contains


def build_code(to: str, language: str, code: str) -> EmailMessage:
    subject, body = VERIFY.get(language, VERIFY["en"])
    message = EmailMessage()
    name, address = parseaddr(get_settings().mail_from)
    message["From"] = formataddr((name or "Segue", address))
    message["To"] = _recipient(to)
    message["Subject"] = subject
    message.set_content(body.format(code=code))
    return message


async def send_code(to: str, language: str, code: str) -> bool:
    return await _deliver(build_code(to, language, code))


def build(to: str, language: str, title: str, body: str, variables: dict) -> EmailMessage:
    """Compose the message. Pure: no network, so it can be tested."""
    s = get_settings()
    words = EMAIL.get(language, EMAIL["en"])
    rtl = language in RTL
    route = None
    if variables.get("origin") and variables.get("destination"):
        route = Transfer(int(variables.get("minutes") or 0), variables.get("how") or "", variables["origin"], variables["destination"], bool(variables.get("sourced")))
    svg = route_map_svg(route, variables.get("arr_gate") or None, variables.get("gate") or None) if route else None
    png = svg_to_png(svg) if svg else None

    message = EmailMessage()
    name, address = parseaddr(s.mail_from)
    message["From"] = formataddr((name or "Segue", address))
    message["To"] = _recipient(to)
    message["Subject"] = words["subject"].format(title=title)
    route_line = words["minutes"].format(minutes=route.minutes, how=route.how) if route else ""
    footer = f"{words['why']} {words['privacy'].format(hours=s.retention_hours)}"
    message.set_content("\n\n".join(part for part in (title, body, f"{words['route']}\n{route_line}" if route else "", f"{words['official']}: {s.official_map_url}", footer) if part))

    align = "right" if rtl else "left"
    html = f"""<!doctype html>
<html lang="{language}" dir="{'rtl' if rtl else 'ltr'}">
<body style="margin:0;padding:24px;background:{MIST};font-family:'Instrument Sans',Arial,Helvetica,sans-serif;color:{DEEP};text-align:{align}">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:26px;padding:28px;border:1px solid #ebebeb">
    <p style="margin:0 0 6px;font-size:14px;color:{OCEAN};font-weight:700">Segue</p>
    <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2">{escape(title)}</h1>
    <p style="margin:0 0 22px;font-size:17px;line-height:1.5">{escape(body)}</p>
    {f'''<h2 style="margin:0 0 6px;font-size:18px">{escape(words["route"])}</h2>
    <p style="margin:0 0 12px;font-size:15px;color:{MUTED}" dir="ltr">{escape(route_line)}</p>''' if route else ''}
    {'<img src="cid:route-map" alt="' + escape(f"Map of Dubai International: {variables.get('arr_gate') or route.origin} to {variables.get('gate') or route.destination}, about {route.minutes} minutes") + '" width="544" style="width:100%;max-width:544px;height:auto;border-radius:18px;display:block;margin:0 0 18px">' if png else ''}
    <p style="margin:0 0 22px"><a href="{escape(s.official_map_url)}" style="display:inline-block;padding:12px 20px;border-radius:18px;background:{DEEP};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">{escape(words["official"])}</a></p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:{MUTED}">{escape(footer)}</p>
  </div>
</body>
</html>"""
    message.add_alternative(html, subtype="html")
    if png:
        message.get_payload()[1].add_related(png, maintype="image", subtype="png", cid="<route-map>")
    if svg:
        message.add_attachment(svg.encode(), maintype="image", subtype="svg+xml", filename="dxb-route.svg")
    return message


async def send(to: str, language: str, title: str, body: str, variables: dict) -> bool:
    """Send one alert. Returns False (and logs the reason, never the address) if mail is down: the in-app message still stands."""
    return await _deliver(build(to, language, title, body, variables))


async def _deliver(message: EmailMessage) -> bool:
    s = get_settings()
    if s.smtp_user and not (s.smtp_starttls or s.smtp_tls):
        log.warning("email not sent: SMTP credentials are set without SMTP_STARTTLS or SMTP_TLS, and are never sent in clear text")
        return False

    async def deliver():
        await aiosmtplib.send(message, hostname=s.smtp_host, port=s.smtp_port, username=s.smtp_user or None, password=s.smtp_password or None, start_tls=s.smtp_starttls, use_tls=s.smtp_tls, timeout=10)

    try:
        await Breaker(redis(), "mail").call(deliver)
        return True
    except Exception as error:
        log.warning("email not sent: %s", type(error).__name__)
        return False
