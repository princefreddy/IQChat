import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'iqchat.db')

def migrate():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Add expires_at column
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN expires_at DATETIME;")
        print("Successfully added expires_at column to messages.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column expires_at already exists.")
        else:
            print(f"Error adding expires_at: {e}")

    # Add reply_to_id column
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN reply_to_id VARCHAR;")
        print("Successfully added reply_to_id column to messages.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column reply_to_id already exists.")
        else:
            print(f"Error adding reply_to_id: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
