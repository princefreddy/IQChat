import os
from PIL import Image

def sanitize_png(file_path):
    print(f"Sanitizing: {file_path}")
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
        
    try:
        # Open image
        with Image.open(file_path) as img:
            # Convert to standard RGBA (8-bit per channel)
            clean_img = img.convert("RGBA")
            
            # Save it back, overwriting the original file
            # This completely recreates the PNG headers and strips corrupt metadata
            clean_img.save(file_path, "PNG")
            print("Successfully sanitized!")
    except Exception as e:
        print(f"Error sanitizing {file_path}: {str(e)}")

def sanitize_directory(directory_path):
    if not os.path.exists(directory_path):
        print(f"Directory not found: {directory_path}")
        return
    for root, _, files in os.walk(directory_path):
        for file in files:
            if file.lower().endswith(".png"):
                full_path = os.path.join(root, file)
                sanitize_png(full_path)

if __name__ == "__main__":
    # Sanitize all mobile asset images
    mobile_assets_dir = r"d:\IQChat\mobile\assets\images"
    sanitize_directory(mobile_assets_dir)
    
    # Sanitize web public logo
    web_logo_path = r"d:\IQChat\web\public\logo.png"
    sanitize_png(web_logo_path)

