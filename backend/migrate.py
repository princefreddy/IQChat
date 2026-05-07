import sqlite3

try:
    conn = sqlite3.connect('d:/IQChat/backend/iqchat.db')
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT 0;")
    conn.commit()
    print("Migration successful")
except Exception as e:
    print("Migration Error:", e)
finally:
    conn.close()
