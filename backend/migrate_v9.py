import sqlite3

try:
    conn = sqlite3.connect('d:/IQChat/backend/iqchat.db')
    cursor = conn.cursor()
    
    # Add file attachment columns to messages
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN file_url VARCHAR;")
    except Exception as e:
        print(f"file_url: {e}")
    
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN file_type VARCHAR;")
    except Exception as e:
        print(f"file_type: {e}")
    
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN file_name VARCHAR;")
    except Exception as e:
        print(f"file_name: {e}")
    
    conn.commit()
    print("Migration V9 (file attachments) successful")
except Exception as e:
    print("Migration V9 Error:", e)
finally:
    conn.close()
