import sys
import os
from rapidfuzz import process, fuzz 
import pandas as pd

# --- NUCLEAR FIX: FORCE PYTHON TO SEE 'validation.py' ---
# This gets the folder where this file lives (backend/engine) and adds it to the system path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

import validation
# --------------------------------

# This imports your EXISTING validation.py file
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import validation 

class RuleLibrary:
    # 1. THE MENU (Tells Frontend what to show)
    @staticmethod
    def get_rules_for_datatype(dtype: str):
        dtype = dtype.lower()

        # --- 1. COMMON RULES (Applied to all) ---
        common_rules = [
            {"name": "Not Null", "code": "not_null", "desc": "Value cannot be empty or None"},
            {"name": "Is Unique", "code": "is_unique", "desc": "Value must be unique across the entire column"}
        ]

        # --- 2. STRING / TEXT RULES ---
        if dtype in ["string", "varchar", "text", "char"]:
            return common_rules + [
                {"name": "Is Email", "code": "is_email", "desc": "Must be a valid email format (user@example.com)"},
                {"name": "Min Length", "code": "min_length", "input_needed": True, "desc": "Length must be greater than X"},
                {"name": "Max Length", "code": "max_length", "input_needed": True, "desc": "Length must be less than X"},
                {"name": "Contains Text", "code": "contains", "input_needed": True, "desc": "Must contain a specific substring"},
                {"name": "Starts With", "code": "starts_with", "input_needed": True, "desc": "Must start with specific characters"},
                {"name": "Ends With", "code": "ends_with", "input_needed": True, "desc": "Must end with specific characters"},
                {"name": "Is Uppercase", "code": "is_upper", "desc": "All characters must be CAPITALIZED"},
                {"name": "Is Lowercase", "code": "is_lower", "desc": "All characters must be lowercase"},
                {"name": "No Special Chars", "code": "no_special", "desc": "Only letters and numbers allowed (Alphanumeric)"},
                {"name": "Is Alpha Only", "code": "is_alpha", "desc": "Only letters allowed (No numbers)"},
                {"name": "Is Numeric String", "code": "is_numeric_str", "desc": "String must contain only numbers"},
                {"name": "Fuzzy Match", "code": "fuzzy_match", "input_needed": "master_data", "desc": "Check similarity against a Master List"}
            ]

        # --- 3. INTEGER / FLOAT / NUMERIC RULES ---
        elif dtype in ["integer", "int", "bigint", "float", "decimal", "numeric", "double"]:
            return common_rules + [
                {"name": "Is Positive", "code": "is_positive", "desc": "Value must be greater than 0"},
                {"name": "Is Negative", "code": "is_negative", "desc": "Value must be less than 0"},
                {"name": "Is Zero", "code": "is_zero", "desc": "Value must be exactly 0"},
                {"name": "Greater Than", "code": "gt", "input_needed": True, "desc": "Value > X"},
                {"name": "Less Than", "code": "lt", "input_needed": True, "desc": "Value < X"},
                {"name": "Value Range", "code": "range", "input_needed": True, "desc": "Value must be between Min and Max"},
                {"name": "Is Even", "code": "is_even", "desc": "Number must be even (Integers only)"},
                {"name": "Is Odd", "code": "is_odd", "desc": "Number must be odd (Integers only)"},
                {"name": "No Decimals", "code": "no_decimals", "desc": "Value must be a whole number"}
            ]

        # --- 4. DATE / TIMESTAMP RULES ---
        elif dtype in ["date", "timestamp", "datetime", "time"]:
            return common_rules + [
                {"name": "Is Future Date", "code": "is_future", "desc": "Date must be in the future"},
                {"name": "Is Past Date", "code": "is_past", "desc": "Date must be in the past"},
                {"name": "Is Today", "code": "is_today", "desc": "Date must be the current date"},
                {"name": "Before Date", "code": "before_date", "input_needed": True, "desc": "Date must be before X (YYYY-MM-DD)"},
                {"name": "After Date", "code": "after_date", "input_needed": True, "desc": "Date must be after X (YYYY-MM-DD)"},
                {"name": "Date Range", "code": "date_range", "input_needed": True, "desc": "Date must be between X and Y"},
                {"name": "Is Weekend", "code": "is_weekend", "desc": "Date must fall on a Saturday or Sunday"},
                {"name": "Is Weekday", "code": "is_weekday", "desc": "Date must fall on Monday through Friday"},
                {"name": "First Day of Month", "code": "is_first_day", "desc": "Date must be the 1st of the month"}
            ]

        # --- 5. BOOLEAN RULES ---
        elif dtype in ["boolean", "bool"]:
            return common_rules + [
                {"name": "Is True", "code": "is_true", "desc": "Value must be True (or 1, 'Yes', 'T')"},
                {"name": "Is False", "code": "is_false", "desc": "Value must be False (or 0, 'No', 'F')"},
                {"name": "Allow 1/0 Format", "code": "fmt_1_0", "desc": "Accepts 1 as True and 0 as False"},
                {"name": "Allow Yes/No Format", "code": "fmt_yes_no", "desc": "Accepts 'Yes' as True and 'No' as False"},
                {"name": "Allow T/F Format", "code": "fmt_t_f", "desc": "Accepts 'T' as True and 'F' as False"},
                {"name": "Strict Boolean", "code": "strict_bool", "desc": "Only allows Python True/False types, no strings/ints"}
            ]

        return common_rules
    
    # 2. THE ROUTER (Connects to validation.py)
    @staticmethod
    def validate(value, rule_type, rule_value=None, master_data=None):
        # A. Handle Fuzzy Match Here (Since it needs master_data)
        if rule_type == "fuzzy_match":
            if not value: return True, None
            if not master_data: return False, "No Master Data provided"
            threshold = int(rule_value) if rule_value else 80
            match = process.extractOne(str(value), master_data, scorer=fuzz.ratio)
            if match and match[1] >= threshold:
                return True, str(match[0])
            return False, f"Low Confidence ({match[1] if match else 0}%)"

        # B. Delegate EVERYTHING else to validation.py
        try:
            return validation.validate_single_value(value, rule_type, rule_value)
        except Exception as e:
            return False, f"Error: {str(e)}"
