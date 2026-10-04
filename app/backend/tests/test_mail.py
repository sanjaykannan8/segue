"""The email is composed without a network, so its content can be checked here."""
from segue.consumers import mailer
from segue.consumers.templates import LANGUAGES, TEMPLATES, render
from segue.api.notice import notice

VARS = {"outbound": "BA108", "dest": "LHR", "gate": "B14", "seat": "12A", "arr_gate": "C22", "origin": "C", "destination": "B", "minutes": 30, "how": "Walk between the B and C gates", "sourced": True}


def test_email_has_text_html_and_the_vector_map():
    title, body = render("called_off_first", "en", VARS)
    message = mailer.build("priya@example.com", "en", title, body, VARS)
    assert message["Subject"] == "Segue: You\'ll be called off first" and message["To"] == "priya@example.com"
    kinds = [part.get_content_type() for part in message.walk()]
    assert "text/plain" in kinds and "text/html" in kinds and "image/svg+xml" in kinds, kinds
    svg = next(part for part in message.walk() if part.get_content_type() == "image/svg+xml").get_content()
    svg = svg.decode() if isinstance(svg, bytes) else svg
    assert "OpenStreetMap contributors" in svg and "C22" in svg and "B14" in svg and "about 30 min" in svg
    html = next(part for part in message.walk() if part.get_content_type() == "text/html").get_content()
    assert "dubaiairports.ae" in html and "Stay in seat 12A" in html


def test_arabic_email_reads_right_to_left():
    title, body = render("hurry", "ar", VARS)
    html = next(part for part in mailer.build("a@example.com", "ar", title, body, VARS).walk() if part.get_content_type() == "text/html").get_content()
    assert 'dir="rtl"' in html and 'lang="ar"' in html


def test_email_without_known_gates_still_goes_without_a_map():
    title, body = render("on_track", "en", VARS)
    message = mailer.build("a@example.com", "en", title, body, {**VARS, "origin": None, "destination": None})
    assert "image/svg+xml" not in [part.get_content_type() for part in message.walk()]


def test_every_language_has_every_message_and_notice():
    for language in LANGUAGES:
        assert set(TEMPLATES[language]) == set(TEMPLATES["en"]), language
        for template in TEMPLATES["en"]:
            title, body = render(template, language, VARS)
            assert title and body and "{" not in title + body, (language, template)
        n = notice(language)
        assert n["lang"] == language and len(n["sections"]) == 6 and len(n["purposes"]) == 4
    assert notice("ar")["dir"] == "rtl" and notice("ta")["dir"] == "ltr" and notice("xx")["lang"] == "en"
