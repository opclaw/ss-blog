#!/usr/bin/env python3
"""
Wordstat Fetcher для Smart Solutions
Запускает запросы к Yandex Cloud Search API v2 (Wordstat)
и сохраняет результаты в JSON + CSV.

Использование:
    pip install requests
    python wordstat-fetcher.py

Или без зависимостей:
    python wordstat-fetcher.py  # использует urllib (встроено в Python)
"""

import json
import ssl
import sys
import os
import time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ============================================================
# ВАШИ КЛЮЧИ
# ============================================================
API_KEY = os.environ.get("YANDEX_API_KEY", "ВСТАВЬТЕ_ВАШ_API_КЛЮЧ_СЮДА")
FOLDER_ID = os.environ.get("YANDEX_FOLDER_ID", "ВСТАВЬТЕ_ВАШ_FOLDER_ID_СЮДА")
API_BASE = "https://searchapi.api.cloud.yandex.net/v2/wordstat"
REGION_RU = "225"  # Россия целиком (213 — это только Москва)

# SSL context (отключаем проверку для локального запуска)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# ============================================================
# ЗАПРОСЫ ДЛЯ АНАЛИЗА
# ============================================================
KEYWORDS = [
    # Юристы — что именно ищут: сервисы или автоматизацию фирмы
    "ии для юристов", "нейросеть для юристов", "сервисы ии для юристов", "ии для юриста бесплатно", "ии для составления договоров", "ии проверка договора",
    # Главная статья
    "ии для бизнеса", "внедрение ии в бизнес", "внедрение ии", "искусственный интеллект для бизнеса",
    # Продажи и CRM
    "ии для продаж", "ии в crm", "ии в битрикс24", "ии в amocrm", "ии агент для 1с", "ии для отдела продаж",
    # Деньги
    "стоимость внедрения ии", "сколько стоит внедрение ии", "окупаемость ии", "эффективность внедрения ии",
    # Отрасли: «ии» против «автоматизация»
    "ии для недвижимости", "ии для риэлтора", "ии для медицинского центра", "ии для клиники", "ии в медицине",
    "ии для онлайн школы", "ии для салона красоты", "ии для турагентства", "ии в строительстве", "автоматизация строительства",
    "ии в логистике", "автоматизация логистики", "ии на производстве", "автоматизация производства",
    "ии для ресторана", "автоматизация ресторана", "ии для интернет магазина", "ии для бухгалтерии", "ии для hr", "ии для маркетинга",
    # GEO
    "geo оптимизация", "как попасть в ответы нейросети", "продвижение в нейросетях",
]

# ============================================================
# ФУНКЦИИ
# ============================================================

def call_api(path, body):
    """Вызов Yandex Cloud Search API v2"""
    body["folderId"] = FOLDER_ID
    
    data = json.dumps(body).encode("utf-8")
    req = Request(
        f"{API_BASE}/{path}",
        data=data,
        headers={
            "Authorization": f"Api-Key {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    
    try:
        with urlopen(req, timeout=30, context=SSL_CTX) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"  ❌ HTTP {e.code}: {error_body[:200]}")
        return None
    except URLError as e:
        print(f"  ❌ Network error: {e.reason}")
        return None
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return None


def fetch_top(phrase):
    """Получить топ запросов по фразе"""
    return call_api("topRequests", {
        "phrase": phrase,
        "numPhrases": 20,
        "regions": [REGION_RU],
    })


def fetch_dynamics(phrase):
    """Получить динамику запросов за 6 месяцев"""
    now = datetime.now()
    from_date = now.replace(month=now.month - 6 if now.month > 6 else now.month + 6,
                            year=now.year if now.month > 6 else now.year - 1)
    
    return call_api("dynamics", {
        "phrase": phrase,
        "period": "PERIOD_MONTHLY",
        "fromDate": from_date.strftime("%Y-%m-%dT00:00:00Z"),
        "toDate": now.strftime("%Y-%m-%dT23:59:59Z"),
    })


# ============================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================

def main():
    print("=" * 60)
    print("  Wordstat Fetcher — Smart Solutions")
    print(f"  Запросов для анализа: {len(KEYWORDS)}")
    print(f"  Folder ID: {FOLDER_ID}")
    print("=" * 60)
    print()
    
    # Тестовый запрос
    print("🔍 Тестовый запрос: 'ии для бизнеса'...")
    test = fetch_top("ии для бизнеса")
    if test is None:
        print("\n❌ Ошибка подключения. Проверьте:")
        print("  1. API-ключ действителен")
        print("  2. Folder ID корректный")
        print("  3. У сервисного аккаунта есть роль search-api.webSearch.user")
        print("  4. Интернет-соединение работает")
        sys.exit(1)
    
    print(f"  ✅ Работает! Всего запросов: {test.get('totalCount', 'N/A')}")
    print()
    
    # Собираем данные по всем ключам
    results = {}
    total = len(KEYWORDS)
    
    for i, keyword in enumerate(KEYWORDS):
        print(f"[{i+1}/{total}] 🔍 {keyword}...")
        
        data = fetch_top(keyword)
        if data:
            results[keyword] = {
                "totalCount": data.get("totalCount", 0),
                "topRequests": data.get("results", []),
                "associations": data.get("associations", []),
            }
            print(f"   📊 {data.get('totalCount', 0):>10,} показов/мес")
        else:
            results[keyword] = {"totalCount": 0, "topRequests": [], "associations": []}
        
        # Задержка чтобы не превысить лимиты
        time.sleep(0.5)
    
    # Сохраняем JSON
    output_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(output_dir, "wordstat-blog-rework.json")
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Результаты сохранены: {json_path}")
    
    # Сохраняем CSV (удобно для Excel)
    csv_path = os.path.join(output_dir, "wordstat-blog-rework.csv")
    
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("Запрос;Всего показов;Топ-запрос 1;Частота 1;Топ-запрос 2;Частота 2;Топ-запрос 3;Частота 3\n")
        
        for keyword, data in sorted(results.items(), key=lambda x: x[1]["totalCount"], reverse=True):
            total_count = data["totalCount"]
            tops = data["topRequests"][:3]
            
            row = [keyword, str(total_count)]
            for t in tops:
                row.append(t.get("phrase", ""))
                row.append(str(t.get("count", "")))
            while len(row) < 8:
                row.append("")
            
            f.write(";".join(row) + "\n")
    
    print(f"✅ CSV сохранён: {csv_path}")
    
    # Сводка
    print("\n" + "=" * 60)
    print("  СВОДКА")
    print("=" * 60)
    
    sorted_results = sorted(results.items(), key=lambda x: x[1]["totalCount"], reverse=True)
    
    print(f"\n{'Запрос':<45} {'Показов/мес':>12}")
    print("-" * 60)
    
    for keyword, data in sorted_results:
        count = data["totalCount"]
        if count >= 10000:
            marker = " 🔴 ВЧ"
        elif count >= 1000:
            marker = " 🟡 СЧ"
        elif count >= 100:
            marker = " 🟢 НЧ"
        else:
            marker = " ⚪ микро"
        
        print(f"{keyword:<45} {count:>10,}{marker}")
    
    total_potential = sum(d["totalCount"] for d in results.values())
    print(f"\nСуммарный потенциал: {total_potential:,} показов/мес")


if __name__ == "__main__":
    main()
