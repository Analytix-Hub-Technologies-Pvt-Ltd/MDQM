import re
import math
from datetime import datetime
import pandas as pd
import numpy as np
from dateutil import parser as date_parser
from rapidfuzz import fuzz

class GoldenRecordEngine:
    @staticmethod
    def detect_field_type(series: pd.Series) -> str:
        """
        Detect column data type dynamically based on actual values.
        Returns: 'name' | 'fullname' | 'email' | 'phone' | 'date' | 'categorical' | 'numeric' | 'id'
        """
        # Drop null values for analysis
        vals = series.dropna().astype(str).str.strip()
        if len(vals) == 0:
            return "categorical"

        # Check numeric types
        try:
            pd.to_numeric(series.dropna(), errors="raise")
            # If all are integers and look like IDs or zipcodes, check if they are unique
            non_null_count = len(series.dropna())
            unique_count = series.dropna().nunique()
            if unique_count == non_null_count and non_null_count > 1:
                return "id"
            return "numeric"
        except (ValueError, TypeError):
            pass

        # Email regex check
        email_pattern = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")
        email_matches = vals.apply(lambda x: bool(email_pattern.match(x)))
        if email_matches.mean() > 0.7:
            return "email"

        # Phone number check (digits, dashes, parentheses, spaces, plus signs)
        phone_pattern = re.compile(r"^\+?[\d\s\-\(\)\.]{7,20}$")
        phone_matches = vals.apply(lambda x: bool(phone_pattern.match(x)) if len(re.sub(r"\D", "", x)) >= 7 else False)
        if phone_matches.mean() > 0.7:
            return "phone"

        # Date format parsing check
        date_score = 0
        sample_size = min(len(vals), 100)
        sample = vals.sample(sample_size, random_state=42) if len(vals) > 100 else vals
        for v in sample:
            # Skip short numeric codes
            if len(v) < 5:
                continue
            try:
                date_parser.parse(v)
                date_score += 1
            except (ValueError, TypeError, OverflowError):
                pass
        if date_score / max(sample_size, 1) > 0.7:
            return "date"

        # ID check (alphanumeric keys, hex tokens, GUIDs, or high uniqueness)
        unique_ratio = vals.nunique() / len(vals)
        guid_pattern = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
        guid_matches = vals.apply(lambda x: bool(guid_pattern.match(x)))
        if guid_matches.mean() > 0.5 or (unique_ratio > 0.95 and len(vals) > 10):
            return "id"

        # Distinguish name and fullname
        word_counts = vals.apply(lambda x: len(x.split()))
        avg_words = word_counts.mean()
        if avg_words > 1.5:
            return "fullname"
        elif avg_words >= 1.0 and vals.nunique() > 5:
            # Short names
            return "name"

        return "categorical"

    @staticmethod
    def compute_field_similarity(val_a: Any, val_b: Any, field_type: str) -> float:
        """Compute similarity score between 0.0 and 1.0 based on field type."""
        # Handle null values
        if pd.isna(val_a) or pd.isna(val_b) or val_a is None or val_b is None:
            return 0.0

        str_a = str(val_a).strip()
        str_b = str(val_b).strip()

        if not str_a or not str_b:
            return 0.0

        if field_type == "fullname":
            return fuzz.token_sort_ratio(str_a.lower(), str_b.lower()) / 100.0

        if field_type == "name":
            return fuzz.jaro_winkler(str_a.lower(), str_b.lower()) / 100.0

        if field_type in ("categorical", "phone", "id", "email"):
            # Normalize strings for comparison (remove non-alphanumeric for phones/ids)
            if field_type == "phone":
                norm_a = re.sub(r"\D", "", str_a)
                norm_b = re.sub(r"\D", "", str_b)
            else:
                norm_a = str_a.lower()
                norm_b = str_b.lower()
            return 1.0 if norm_a == norm_b else 0.0

        if field_type == "date":
            try:
                d1 = date_parser.parse(str_a)
                d2 = date_parser.parse(str_b)
                diff_days = abs((d1 - d2).days)
                return max(0.0, 1.0 - (diff_days / 365.0))
            except Exception:
                return 0.0

        if field_type == "numeric":
            try:
                num_a = float(val_a)
                num_b = float(val_b)
                if num_a == num_b:
                    return 1.0
                denom = max(abs(num_a), abs(num_b))
                if denom == 0.0:
                    return 1.0
                return max(0.0, 1.0 - (abs(num_a - num_b) / denom))
            except Exception:
                return 0.0

        return 0.0

    @classmethod
    def compute_dynamic_weights(cls, df_a: pd.DataFrame, df_b: pd.DataFrame, join_key: str) -> dict[str, float]:
        """
        Compute dynamic weights per overlapping column.
        Weight = completeness_score * variance_score.
        Join key is excluded (weight=0).
        """
        weights = {}
        # Find overlapping columns
        overlap_cols = set(df_a.columns) & set(df_b.columns)
        
        for col in overlap_cols:
            if col.lower() == join_key.lower():
                weights[col] = 0.0
                continue

            # Completeness: fraction of non-nulls in both sources combined
            comp_a = df_a[col].notna().mean() if len(df_a) > 0 else 0.0
            comp_b = df_b[col].notna().mean() if len(df_b) > 0 else 0.0
            completeness = (comp_a + comp_b) / 2.0

            # Variance: 1 - ratio of matched pairs that are identical
            # Join dataframes temporarily on join_key to calculate variance of overlapping columns
            # Clean join_keys
            key_a = next((c for c in df_a.columns if c.lower() == join_key.lower()), join_key)
            key_b = next((c for c in df_b.columns if c.lower() == join_key.lower()), join_key)
            
            merged = pd.merge(df_a[[key_a, col]].dropna(), df_b[[key_b, col]].dropna(), left_on=key_a, right_on=key_b, suffixes=('_a', '_b'))
            if len(merged) > 0:
                identical = (merged[col + "_a"].astype(str).str.strip().str.lower() == 
                             merged[col + "_b"].astype(str).str.strip().str.lower()).sum()
                identical_ratio = identical / len(merged)
                variance = 1.0 - identical_ratio
            else:
                variance = 1.0

            weights[col] = float(completeness * variance)

        return weights

    @classmethod
    def compute_row_score(cls, record_a: dict, record_b: dict, weights: dict[str, float], field_types: dict[str, str]) -> float:
        """Compute the composite row-level similarity score from 0.0 to 100.0."""
        weighted_sum = 0.0
        total_weight = 0.0

        for col, weight in weights.items():
            if weight <= 0.0:
                continue

            val_a = record_a.get(col)
            val_b = record_b.get(col)

            # Skip calculation if BOTH are null (don't penalize or reward)
            if (pd.isna(val_a) or val_a is None) and (pd.isna(val_b) or val_b is None):
                continue

            field_type = field_types.get(col, "categorical")
            sim = cls.compute_field_similarity(val_a, val_b, field_type)
            weighted_sum += sim * weight
            total_weight += weight

        if total_weight <= 0.0:
            return 100.0 if record_a == record_b else 0.0

        return (weighted_sum / total_weight) * 100.0

    @staticmethod
    def determine_survivorship(record_a: dict, record_b: dict, weights: dict[str, float], trust_a: int = 50, trust_b: int = 50) -> dict:
        """
        Merge two records using survivorship rules.
        Per field: prefer non-null, then higher trust score, then default to a.
        """
        golden = {}
        # Union of all keys
        all_keys = set(record_a.keys()) | set(record_b.keys())

        for k in all_keys:
            val_a = record_a.get(k)
            val_b = record_b.get(k)

            is_a_null = pd.isna(val_a) or val_a is None or str(val_a).strip() == ""
            is_b_null = pd.isna(val_b) or val_b is None or str(val_b).strip() == ""

            if is_a_null and not is_b_null:
                golden[k] = val_b
            elif is_b_null and not is_a_null:
                golden[k] = val_a
            elif is_a_null and is_b_null:
                golden[k] = None
            else:
                # Both non-null: resolve via trust score
                if trust_a > trust_b:
                    golden[k] = val_a
                elif trust_b > trust_a:
                    golden[k] = val_b
                else:
                    golden[k] = val_a  # Default tie-breaker

        return golden
