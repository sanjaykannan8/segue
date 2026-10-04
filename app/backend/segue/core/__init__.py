import logging

# httpx logs every request URL at INFO, and the flight API takes its key in the URL.
for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)
