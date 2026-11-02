import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "homichat.db")

try:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT 0;")
    conn.commit()
    print("Migration successful")
except Exception as e:
    print("Migration Error:", e)
finally:
    conn.close()
