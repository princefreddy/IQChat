# Placeholder for server-side encryption utilities if required later.
# In the current MVP, E2E encryption is handled client-side by generating
# keys locally and only sending the public_key to the backend.

def get_public_key_format():
    return "RSA/AES"
