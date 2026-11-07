"""Validate D1 exports only in fresh, isolated SQLite files. Never print SQL."""
import json
import os
import sqlite3
import sys

def authorize(action, first, second, _database, _trigger):
    if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_PRAGMA and str(first).lower() == "writable_schema":
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and str(second).lower() == "load_extension":
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK

try:
    request = json.load(sys.stdin)
    results = []
    for index, source in enumerate(request["sources"]):
        path = os.path.join(request["directory"], "d1", f"{index}.sql")
        target = os.path.join(request["directory"], f"isolated-{index}.sqlite")
        if os.path.exists(target):
            raise ValueError("Restore target must be new")
        with sqlite3.connect(target) as connection:
            connection.enable_load_extension(False)
            connection.set_authorizer(authorize)
            with open(path, encoding="utf-8") as sql:
                connection.executescript(sql.read())
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Integrity failed")
            tables = {row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")}
            if tables != set(source["tables"]):
                raise ValueError("Restored table inventory differs from source")
            rows = sum(connection.execute(
                'SELECT count(*) FROM "' + table.replace('"', '""') + '"'
            ).fetchone()[0] for table in tables)
            results.append({"tables": len(tables), "rows": rows})
    print(json.dumps({"databases": len(results), "results": results}))
except Exception:
    print("Isolated D1 restoration check failed.", file=sys.stderr)
    sys.exit(1)
