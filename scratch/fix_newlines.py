import os

target_file = 'server.ts'
with open(target_file, 'rb') as f:
    content = f.read()

# The error is likely that \n\n was written as literal string "\\n\\n"
# Looking at the previous output: 3022:   });\n\napp.get('/api/admin/reports', authenticate, isAdmin, (req, res) => {
# This means the characters \ and n are literal.

bad_string = b'});\\n\\napp.get(\'/api/admin/reports\''
good_string = b'});\n\n  app.get(\'/api/admin/reports\''

if bad_string in content:
    print("Found bad string, replacing...")
    new_content = content.replace(bad_string, good_string)
    with open(target_file, 'wb') as f:
        f.write(new_content)
    print("Fixed!")
else:
    print("Bad string not found exactly. Checking variations...")
    # Try with double backslashes just in case
    bad_string2 = b'});\\\\n\\\\napp.get(\'/api/admin/reports\''
    if bad_string2 in content:
        print("Found bad string (double backslash), replacing...")
        new_content = content.replace(bad_string2, good_string)
        with open(target_file, 'wb') as f:
            f.write(new_content)
        print("Fixed!")
    else:
        print("Still not found.")
