import re
import os

filepath = 'backend/models.py'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Add Numeric to imports
content = re.sub(r'from sqlalchemy import (.*?)', r'from sqlalchemy import Numeric, \1', content, count=1)

# 2. Replace String and String(x) with Text
content = re.sub(r'String\(\d+\)', 'Text', content)
content = re.sub(r'\bString\b', 'Text', content)

# 3. Replace Float with Numeric
content = re.sub(r'\bFloat\b', 'Numeric', content)

# 4. Replace DateTime(timezone=True) with DateTime
content = re.sub(r'DateTime\(timezone=True\)', 'DateTime', content)

with open(filepath, 'w') as f:
    f.write(content)

print("Updated models.py")
