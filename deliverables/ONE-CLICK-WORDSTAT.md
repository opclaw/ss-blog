# Как получить данные Wordstat за 30 секунд

## Способ 1: На своём компьютере (рекомендуется)

### Шаг 1: Скачайте файл
Скачайте файл `wordstat-fetcher.py` из репозитория.

### Шаг 2: Откройте терминал и выполните:
```bash
pip install requests 2>/dev/null  # если не установлен
python3 wordstat-fetcher.py
```

### Что произойдёт:
1. Скрипт проверит подключение (тестовый запрос)
2. Прогонит 75 ключевых запросов (~40 секунд)
3. Создаст два файла:
   - `wordstat-results.json` — полные данные
   - `wordstat-results.csv` — для Excel (через точку с запятой)
4. Выведет таблицу с частотностью и маркерами ВЧ/СЧ/НЧ

### Если возникла ошибка:
```
❌ HTTP 403: ...
```
→ У сервисного аккаунта нет роли. В Yandex Cloud:
1. Откройте сервисный аккаунт (ajes6pt7qfd81u198o1d)
2. Назначьте роль: `search-api.webSearch.user`
3. Перезапустите скрипт

---

## Способ 2: В Google Colab (без установки)

1. Откройте https://colab.research.google.com/
2. Создайте новый блокнот
3. Вставьте код ниже
4. Нажмите ▶ Run

```python
import json, ssl, time
from urllib.request import Request, urlopen

KEY = "ВАШ_API_КЛЮЧ"
FOLDER = "ВАШ_FOLDER_ID"
API = "https://searchapi.api.cloud.yandex.net/v2/wordstat"

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def query(phrase):
    body = json.dumps({"phrase": phrase, "numPhrases": 20, "regions": ["213"], "folderId": FOLDER}).encode()
    req = Request(f"{API}/topRequests", data=body, 
                  headers={"Authorization": f"Api-Key {KEY}", "Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read())

# Тест
r = query("ии для бизнеса")
print(f"✅ Работает! 'ии для бизнеса' = {r['totalCount']} показов/мес\n")

# Все запросы
keywords = [
    "ии для бизнеса", "ии агент", "цифровые сотрудники", "как создать ии агента",
    "gigachat", "yandexgpt", "как написать промпт", "seo блог",
    "ии для ресторана", "ии для медицинского центра", "ии для продаж",
    "автоматизация документов ии", "скоринг лидов ии", "гео оптимизация",
    "чат боты для бизнеса", "ии для маркетинга", "база знаний отдела продаж",
    "бесплатные ии агенты", "ии агенты обучение", "crm с ии",
]

results = []
for kw in keywords:
    try:
        r = query(kw)
        results.append((kw, r["totalCount"]))
        print(f"  {kw:<45} {r['totalCount']:>10,}")
    except Exception as e:
        print(f"  {kw:<45} ОШИБКА: {e}")
    time.sleep(0.3)

print(f"\n✅ Готово! Скопируйте результаты и отправьте агенту.")
```
