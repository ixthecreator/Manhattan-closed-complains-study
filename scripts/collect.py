"""Download a fixed NYC 311 cohort and select ten records across each day."""

import json
import statistics
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
# 只限定月份、地区和投诉类型；不预先筛选 Closed，避免把关闭状态当成抽样条件。
WHERE = (
    "created_date >= '2026-09-01T00:00:00' "
    "AND created_date < '2026-10-01T00:00:00' "
    "AND borough = 'MANHATTAN' "
    "AND complaint_type = 'Noise - Residential'"
)
FIELDS = (
    "unique_key,created_date,closed_date,agency,complaint_type,descriptor,"
    "status,borough,resolution_description,resolution_action_updated_date"
)


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    # 请求固定字段并按提交时间、编号排序；达到接口上限时停止，避免拿不完整的数据抽样。
    query = {"$select": FIELDS, "$where": WHERE, "$order": "created_date,unique_key", "$limit": 50000}
    url = API + "?" + urllib.parse.urlencode(query)
    with urllib.request.urlopen(url, timeout=90) as response:
        population = json.load(response)
    if len(population) == 50000:
        raise RuntimeError("The query reached its limit; paginate before sampling.")
    observed = datetime.now(timezone.utc).isoformat(timespec="seconds")
    save(ROOT / "research" / "population-snapshot.json", population)

    days = {}
    for row in population:
        days.setdefault(row["created_date"][:10], []).append(row)
    sample = []
    # 每天取十个等距区间的中点排名，覆盖当天的记录顺序；这是设计抽样，不是随机抽样。
    for day, records in sorted(days.items()):
        n = min(10, len(records))
        sample.extend(records[int((i + 0.5) * len(records) / n)] for i in range(n))
    save(ROOT / "data" / "source-records.json", sample)

    # 只有完整回复文字完全相同才归为一组；排序后的索引就是 responseId。
    responses = sorted({row.get("resolution_description", "") for row in sample})
    records = []
    for row in sample:
        start = datetime.fromisoformat(row["created_date"])
        closed = row.get("closed_date")
        # 用关闭时间减去提交时间，转为小时；仅有效的 Closed 记录参与时长统计。
        duration = (datetime.fromisoformat(closed) - start).total_seconds() / 3600 if closed else None
        kind = "closed" if row["status"] == "Closed" and duration is not None and duration >= 0 else "open"
        if row["status"] == "Closed" and (duration is None or duration < 0):
            kind = "undated"
        records.append({
            "id": row["unique_key"],
            "created": row["created_date"],
            "closed": closed,
            "status": row["status"],
            "kind": kind,
            "agency": row["agency"],
            "detail": row.get("descriptor", ""),
            "response": row.get("resolution_description", ""),
            "responseId": responses.index(row.get("resolution_description", "")),
            "hours": round(duration, 6) if kind == "closed" else None,
        })
    # 统计值随快照一起保存，网页无需重复计算；原始完整回复仍保留在每条记录中。
    durations = sorted(r["hours"] for r in records if r["hours"] is not None)
    response_counts = Counter(r["response"] for r in records)
    stats = {
        "medianHours": statistics.median(durations),
        "minHours": min(durations),
        "maxHours": max(durations),
        "uniqueReplies": len(responses),
        "conditionalReplies": sum("If the problem persists" in r["response"] for r in records),
    }
    # meta 保存采集来源与网页使用的统计；处理规则见源码批注。
    metadata = {
        "apiQuery": url,
        "retrievedAt": observed,
        "populationCount": len(population),
        "dailyPopulation": {day: len(rows) for day, rows in sorted(days.items())},
        "stats": stats,
        "replyCounts": [{"text": text, "count": n} for text, n in response_counts.most_common()],
    }
    save(ROOT / "data" / "requests.json", {"meta": metadata, "records": records})
    print(json.dumps({"population": len(population), "retrieved": observed, "stats": stats, "replies": metadata["replyCounts"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
