"""
Одноразова авторизація Google Drive — видає refresh token для сервера.

Запускати на своєму комп'ютері, де є браузер (не на сервері):

    pip install google-auth-oauthlib
    py authorize.py

Відкриється браузер → увійдіть у той Google-акаунт, якому належить
папка проєктів → «Дозволити». Поруч з'явиться google_token.json —
залийте його на сервер разом з рештою файлів і перезапустіть сервер.

Повторювати лише якщо Google відкличе доступ (в лозі сервера буде
invalid_grant). Якщо це стається щотижня — застосунок у Google Cloud
стоїть у режимі «Testing»: APIs & Services → OAuth consent screen →
Publish app, тоді токен житиме без обмеження.
"""
import json
import sys

import config


def main() -> None:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("Спершу встановіть бібліотеку:  pip install google-auth-oauthlib")
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": config.GOOGLE_CLIENT_ID,
            "client_secret": config.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, scopes=config.GOOGLE_SCOPES)
    creds = flow.run_local_server(
        port=0,
        open_browser=True,
        access_type="offline",
        prompt="consent",
        authorization_prompt_message="Якщо браузер не відкрився сам, перейдіть за посиланням:\n{url}\n",
        success_message="Готово! Доступ надано — вікно можна закрити й повернутися в термінал.",
    )
    if not creds.refresh_token:
        print("Google не видав refresh token. Запустіть ще раз і обов'язково натисніть «Дозволити».")
        sys.exit(1)

    config.GOOGLE_TOKEN_FILE.write_text(json.dumps({
        "refresh_token": creds.refresh_token,
        "client_id": config.GOOGLE_CLIENT_ID,
        "scopes": list(creds.scopes or config.GOOGLE_SCOPES),
    }, ensure_ascii=False, indent=2), "utf-8")
    print(f"Збережено: {config.GOOGLE_TOKEN_FILE}")

    session = flow.authorized_session()
    r = session.get(f"https://www.googleapis.com/drive/v3/files/{config.DRIVE_ROOT_FOLDER_ID}",
                    params={"fields": "id,name", "supportsAllDrives": "true"})
    if r.ok:
        print(f"Доступ до головної папки «{r.json().get('name')}» є. Можна заливати на сервер.")
    else:
        print("Токен отримано, але головну папку не видно. Перевірте, що увійшли тим акаунтом, "
              f"якому належить папка {config.DRIVE_ROOT_FOLDER_ID} (HTTP {r.status_code}).")


if __name__ == "__main__":
    main()
