"""Mobile headers retained for Zomato API compatibility, configurable via environment."""

import os

ZOMATO_API_KEY = os.environ.get(
    "ZOMATO_API_KEY", "7749b19667964b87a3efc739e254ada2"
)
ZOMATO_CLIENT_ID = os.environ.get(
    "ZOMATO_CLIENT_ID", "5276d7f1-910b-4243-92ea-d27e758ad02b"
)

AUTH_HEADERS = {
    "Accept": "image/webp",
    "Accept-Encoding": "br, gzip",
    "Connection": "Keep-Alive",
    "is-akamai-video-optimisation-enabled": "0",
    "pragma": "akamai-x-get-request-id,akamai-x-cache-on, akamai-x-check-cacheable",
    "User-Agent": os.environ.get(
        "ZOMATO_USER_AGENT",
        "&source=android_market&version=10&device_manufacturer=Google&device_brand=google&device_model=Android+SDK+built+for+x86_64&api_version=931&app_version=v19.3.1",
    ),
    "USER-BUCKET": "0",
    "USER-HIGH-PRIORITY": "0",
    "X-Access-UUID": os.environ.get(
        "ZOMATO_ACCESS_UUID", "71783d00-13fc-4e81-9ba6-9428f2c6c75c"
    ),
    "X-Accessibility-Dynamic-Text-Scale-Factor": "1.0",
    "X-Accessibility-Voice-Over-Enabled": "0",
    "X-Android-Id": os.environ.get("ZOMATO_ANDROID_ID", "29435aa6a6755a97"),
    "X-APP-APPEARANCE": "LIGHT",
    "X-App-Language": "&lang=en&android_language=en&android_country=",
    "X-App-Session-Id": os.environ.get(
        "ZOMATO_APP_SESSION_ID", "b287175a-035e-4346-b8fb-0b19c4892cea"
    ),
    "X-APP-THEME": "default",
    "X-Appsflyer-UID": os.environ.get(
        "ZOMATO_APPSFLYER_UID", "1770210645057-4891034784193940182"
    ),
    "X-BLINKIT-INSTALLED": "false",
    "X-Bluetooth-On": "false",
    "X-City-Id": "-1",
    "X-Client-Id": "zomato_android_v2",
    "X-Device-Height": "2208",
    "X-Device-Language": "en",
    "X-Device-Pixel-Ratio": "2.75",
    "X-Device-Width": "1080",
    "X-DISTRICT-INSTALLED": "false",
    "X-FIREBASE-INSTANCE-ID": os.environ.get(
        "ZOMATO_FIREBASE_INSTANCE_ID", "3bc79ef61af45c349bef251f2de8d858"
    ),
    "X-Installer-Package-Name": "cm.aptoide.pt",
    "X-Jumbo-Session-Id": os.environ.get(
        "ZOMATO_JUMBO_SESSION_ID", "e26bfcdb-8b7f-462d-a388-d49f6652c0e71770231893"
    ),
    "X-Network-Type": "mobile_UNKNOWN",
    "X-O2-City-Id": "-1",
    "x-perf-class": "PERFORMANCE_AVERAGE",
    "X-Present-Horizontal-Accuracy": "-1",
    "X-Present-Lat": "0.0",
    "X-Present-Long": "0.0",
    "X-Request-Id": os.environ.get(
        "ZOMATO_REQUEST_ID", "69e0492f-48b1-40f2-850c-18f12d92991c"
    ),
    "X-RIDER-INSTALLED": "false",
    "X-SYSTEM-APPEARANCE": "UNSPECIFIED",
    "X-User-Defined-Lat": "0.0",
    "X-User-Defined-Long": "0.0",
    "X-VPN-Active": "1",
    "X-Zomato-API-Key": ZOMATO_API_KEY,
    "X-Zomato-App-Version": "931",
    "X-Zomato-App-Version-Code": "1710019310",
    "X-Zomato-Client-Id": ZOMATO_CLIENT_ID,
    "X-Zomato-UUID": os.environ.get(
        "ZOMATO_UUID", "b2691abb-5aac-48a5-9f0e-750349080dcb"
    ),
}
