import sqlite3

try:
    conn = sqlite3.connect('d:/IQChat/backend/iqchat.db')
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE chats ADD COLUMN status VARCHAR DEFAULT 'pending';")
    cursor.execute("ALTER TABLE messages ADD COLUMN visible_at DATETIME;")
    
    # Retroactively approve all preceding chats so the user isn't locked out of old tests
    cursor.execute("UPDATE chats SET status = 'accepted';")
    
    conn.commit()
    print("Migration V8 successful")
except Exception as e:
    print("Migration V8 Error:", e)
finally:
    conn.close()
