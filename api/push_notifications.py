# api/push_notifications.py
import requests

def send_push_notification(tokens, title, body):
    if not tokens:
        return
    expo_url = "https://exp.host/--/api/v2/push/send"
    payloads = [{
        "to": token,
        "sound": "default",
        "title": title,
        "body": body
    } for token in tokens if token]
    for payload in payloads:
        try:
            requests.post(expo_url, json=payload, timeout=5)
        except Exception as e:
            print("Expo push error:", e)
