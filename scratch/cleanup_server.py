import sys
import os

target_file = 'server.ts'
if not os.path.exists(target_file):
    print(f"File {target_file} not found")
    sys.exit(1)

with open(target_file, 'rb') as f:
    content = f.read()

start_marker = b'  // API Routes - ADMIN USERS'
first_pos = content.find(start_marker)
second_pos = content.find(start_marker, first_pos + len(start_marker))

if first_pos != -1 and second_pos != -1:
    new_content = content[:first_pos] + content[second_pos:]
    with open(target_file, 'wb') as f:
        f.write(new_content)
    print("Deleted block between markers successfully")
else:
    print(f"Markers not found. First: {first_pos}, Second: {second_pos}")
