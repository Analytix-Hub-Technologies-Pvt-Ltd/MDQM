import re
from datetime import datetime
import pandas as pd

# ==========================================
# 1. STRING VALIDATIONS
# ==========================================
def check_is_email(value):
    if pd.isna(value) or not value: return True
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return re.match(pattern, str(value)) is not None

def check_min_length(value, length):
    if pd.isna(value) or not value: return True
    return len(str(value)) >= int(length)

def check_max_length(value, length):
    if pd.isna(value) or not value: return True
    return len(str(value)) <= int(length)

def check_contains(value, substring):
    if pd.isna(value) or not value: return True
    return str(substring).lower() in str(value).lower()

def check_starts_with(value, prefix):
    if pd.isna(value) or not value: return True
    return str(value).startswith(prefix)

def check_ends_with(value, suffix):
    if pd.isna(value) or not value: return True
    return str(value).endswith(suffix)

def check_is_upper(value):
    if pd.isna(value) or not value: return True
    return str(value).isupper()

def check_is_lower(value):
    if pd.isna(value) or not value: return True
    return str(value).islower()

def check_no_special_chars(value):
    if pd.isna(value) or not value: return True
    return str(value).isalnum() 

def check_is_alpha(value):
    if pd.isna(value) or not value: return True
    return str(value).isalpha() 

def check_is_numeric_str(value):
    if pd.isna(value) or not value: return True
    return str(value).isnumeric() 

# ==========================================
# 2. NUMERIC VALIDATIONS (Int/Float)
# ==========================================
def check_is_positive(value):
    if pd.isna(value): return True
    try: return float(value) > 0
    except: return False

def check_is_negative(value):
    if pd.isna(value): return True
    try: return float(value) < 0
    except: return False

def check_is_zero(value):
    if pd.isna(value): return True
    try: return float(value) == 0
    except: return False

def check_gt(value, threshold):
    if pd.isna(value): return True
    try: return float(value) > float(threshold)
    except: return False

def check_lt(value, threshold):
    if pd.isna(value): return True
    try: return float(value) < float(threshold)
    except: return False

def check_range(value, min_val, max_val):
    if pd.isna(value): return True
    try: return float(min_val) <= float(value) <= float(max_val)
    except: return False

def check_is_even(value):
    if pd.isna(value): return True
    try: return float(value) % 2 == 0
    except: return False

def check_is_odd(value):
    if pd.isna(value): return True
    try: return float(value) % 2 != 0
    except: return False

def check_no_decimals(value):
    if pd.isna(value): return True
    try: return float(value).is_integer()
    except: return False

# ==========================================
# 3. DATE VALIDATIONS
# ==========================================
def strip_time_from_date_string(value) -> str:
    """Return date-only portion from strings like 2024-01-10T00:00:00 or 2024-01-10 00:00:00."""
    val_str = str(value).strip()
    if "T" in val_str:
        return val_str.split("T", 1)[0]
    return val_str.split(" ", 1)[0]


def parse_date(value):
    if pd.isna(value) or str(value).lower() == "nan": return None
    
    # 1. FIX: If Pandas already converted it, accept it instantly!
    if isinstance(value, pd.Timestamp) or isinstance(value, datetime):
        return value
        
    # 2. If it is a string, strip the time portion (space or ISO "T" separator)
    val_str = strip_time_from_date_string(value)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try: return datetime.strptime(val_str, fmt)
        except ValueError: continue

    # 3. Fallback: pandas handles ISO timestamps and other common formats
    try:
        parsed = pd.to_datetime(str(value).strip(), errors="coerce")
        if pd.notna(parsed):
            return parsed.to_pydatetime()
    except Exception:
        pass
    return None

def check_is_future(value):
    dt = parse_date(value)
    if not dt: return False 
    return dt > datetime.now()

def check_is_past(value):
    dt = parse_date(value)
    if not dt: return False
    return dt < datetime.now()

def check_is_today(value):
    dt = parse_date(value)
    if not dt: return False
    return dt.date() == datetime.now().date()

def check_is_weekend(value):
    dt = parse_date(value)
    if not dt: return False
    return dt.weekday() >= 5 

# ==========================================
# 4. BOOLEAN VALIDATIONS
# ==========================================
def check_is_true(value):
    if pd.isna(value): return False
    return str(value).lower() in ['true', '1', 'yes', 't', 'on']

def check_is_false(value):
    if pd.isna(value): return False
    return str(value).lower() in ['false', '0', 'no', 'f', 'off']


# ==========================================
# MAIN ROUTER (The function Orchestrator calls)
# ==========================================
def validate_single_value(value, rule_code, rule_value=None):
    try:
        # FIX: Aggressively normalize the rule code to bridge the UI-Backend gap
        rc = str(rule_code).lower().strip().replace(" ", "_")

        # Common
        if rc == "not_null":
            if pd.isna(value) or str(value).strip() == "" or str(value).lower() == "nan":
                return False, "Value is Null/Empty"
            return True, None

        # String
        if rc == "is_email": return (check_is_email(value), "Invalid Email Format")
        if rc == "min_length": return (check_min_length(value, rule_value), f"Length < {rule_value}")
        if rc == "max_length": return (check_max_length(value, rule_value), f"Length > {rule_value}")
        if rc == "contains": return (check_contains(value, rule_value), f"Does not contain '{rule_value}'")
        if rc == "starts_with": return (check_starts_with(value, rule_value), f"Does not start with '{rule_value}'")
        if rc == "ends_with": return (check_ends_with(value, rule_value), f"Does not end with '{rule_value}'")
        if rc == "is_upper": return (check_is_upper(value), "Not Uppercase")
        if rc == "is_lower": return (check_is_lower(value), "Not Lowercase")
        if rc == "no_special": return (check_no_special_chars(value), "Contains Special Characters")
        if rc == "is_alpha": return (check_is_alpha(value), "Contains Numbers/Symbols")
        if rc == "is_numeric_str": return (check_is_numeric_str(value), "Contains Non-Numeric Characters")

        # Numeric (Handles both "gt" and "greater_than" dynamically)
        if rc in ["is_positive", "positive"]: return (check_is_positive(value), "Not Positive")
        if rc in ["is_negative", "negative"]: return (check_is_negative(value), "Not Negative")
        # --- ADD THIS NEW BLOCK HERE ---
        if rc == "decimal_precision":
            if pd.isna(value) or str(value).strip() == "" or str(value).lower() == "nan":
                return True, None
            try:
                str_val = str(value)
                actual = len(str_val.split(".")[1]) if "." in str_val else 0
                limit = int(rule_value) if rule_value else 0
                is_valid = actual <= limit
                return (is_valid, f"Found {actual} decimals, limit is {limit}")
            except:
                return False, "Invalid Number Format"
        # -------------------------------
        if rc in ["is_zero", "zero"]: return (check_is_zero(value), "Not Zero")
        if rc in ["gt", "greater_than"]: return (check_gt(value, rule_value), f"Not Greater Than {rule_value}")
        if rc in ["lt", "less_than"]: return (check_lt(value, rule_value), f"Not Less Than {rule_value}")
        if rc == "range":
            try:
                if "," in str(rule_value): min_v, max_v = str(rule_value).split(",")
                elif "-" in str(rule_value): min_v, max_v = str(rule_value).split("-")
                else: return False, "Invalid Range Format"
                return (check_range(value, min_v, max_v), f"Not in range {min_v}-{max_v}")
            except: return False, "Invalid Range Format"
            
        if rc == "is_even": return (check_is_even(value), "Not Even")
        if rc == "is_odd": return (check_is_odd(value), "Not Odd")
        if rc == "no_decimals": return (check_no_decimals(value), "Contains Decimals")

        # Date
        if rc in ["date_format_check", "date_format"]:
            is_valid = parse_date(value) is not None
            return (is_valid, f"Invalid Date Format (Expected {rule_value})")
        if rc == "is_future": return (check_is_future(value), "Date is not in Future")
        if rc == "is_past": return (check_is_past(value), "Date is not in Past")
        if rc == "is_today": return (check_is_today(value), "Date is not Today")
        if rc == "is_weekend": return (check_is_weekend(value), "Date is not Weekend")

        # Boolean
        if rc == "is_true": return (check_is_true(value), "Value is not True")
        if rc == "is_false": return (check_is_false(value), "Value is not False")

        # THE NUCLEAR FIX: DO NOT FAIL SILENTLY. Throw an error so it goes to quarantine!
        return False, f"System Error: Unrecognized Rule Configuration '{rule_code}'"

    except Exception as e:
        return False, f"System Error: {str(e)}"