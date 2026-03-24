import React, { useState, useEffect } from "react";
import { getDashboardSummary } from "../api";
import {
  Activity,
  Database,
  CheckCircle,
  AlertTriangle,
  Fingerprint,
  ShieldAlert,
  Layers,
} from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await getDashboardSummary();
      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
    setLoading(false);
  };

  if (loading || !data) {
    return (
      <div className="p-10 font-mono text-gray-500 uppercase tracking-widest">
        Compiling System Metrics...
      </div>
    );
  }

  const { system_metrics, data_health } = data;

  // Determine color based on health score
  const scoreColor =
    data_health.overall_score >= 90
      ? "text-green-500"
      : data_health.overall_score >= 70
        ? "text-orange-500"
        : "text-red-600";

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto p-8">
      {/* HEADER SECTION */}
      <div className="mb-10 border-b border-[#A1A3AF] border-opacity-20 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-thin tracking-tighter uppercase flex items-center gap-3">
            <Activity size={32} className="text-blue-600" /> Command Center
          </h1>
          <p className="text-sm text-gray-400 tracking-widest uppercase mt-2">
            Global Data Quality Overview
          </p>
        </div>

        {/* OVERALL HEALTH WIDGET */}
        <div className="text-right">
          <span className="block text-[12px] uppercase tracking-widest text-gray-400 font-normal mb-1">
            Overall Quality Score
          </span>
          <div className={`text-6xl font-normal tracking-tighter ${scoreColor}`}>
            {data_health.overall_score}%
          </div>
        </div>
      </div>

      {/* SYSTEM METRICS (TOP ROW) */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-[#23243B] p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="block text-sm uppercase tracking-widest text-gray-400 mb-2">
              Configured Jobs
            </span>
            <span className="text-3xl font-bold">
              {system_metrics.total_jobs}
            </span>
          </div>
          <Layers size={40} className="text-gray-200" />
        </div>

        <div className="bg-white border border-[#23243B] p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="block text-sm uppercase tracking-widest text-gray-400 mb-2">
              Tables Tracked
            </span>
            <span className="text-3xl font-bold">
              {system_metrics.total_tables}
            </span>
          </div>
          <Database size={40} className="text-gray-200" />
        </div>

        <div className="bg-white border border-[#23243B] p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="block text-sm uppercase tracking-widest text-gray-400 mb-2">
              Active Rules
            </span>
            <span className="text-3xl font-bold">
              {system_metrics.active_rules}
            </span>
          </div>
          <ShieldAlert size={40} className="text-gray-200" />
        </div>
      </div>

      {/* DATA VOLUME & ERRORS (BOTTOM GRID) */}
      <h2 className="text-lg font-normal tracking-widest uppercase text-gray-600 mb-4 border-b border-gray-200 pb-2">
        Data Processing Volume
      </h2>

      <div className="grid grid-cols-4 gap-6">
        {/* Total Processed */}
        <div className="bg-gray-50 border border-gray-200 p-6 flex flex-col justify-between">
          <span className="text-[12px] font-normal uppercase tracking-widest text-gray-500 mb-4">
            Total Rows Processed
          </span>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold text-gray-700">
              {data_health.rows_processed}
            </span>
            <Activity size={24} className="text-gray-300" />
          </div>
        </div>

        {/* Clean Data */}
        <div className="bg-green-50 border border-green-200 p-6 flex flex-col justify-between">
          <span className="text-[12px] font-normal uppercase tracking-widest text-green-700 mb-4">
            Valid Rows (Clean)
          </span>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold text-green-700">
              {data_health.clean_rows}
            </span>
            <CheckCircle size={24} className="text-green-300" />
          </div>
        </div>

        {/* Validation Errors */}
        <div className="bg-orange-50 border border-orange-200 p-6 flex flex-col justify-between">
          <span className="text-[12px] font-normal uppercase tracking-widest text-orange-700 mb-4">
            Validation Violations
          </span>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold text-orange-600">
              {data_health.validation_errors}
            </span>
            <AlertTriangle size={24} className="text-orange-300" />
          </div>
        </div>

        {/* Fuzzy Errors */}
        <div className="bg-purple-50 border border-purple-200 p-6 flex flex-col justify-between">
          <span className="text-[12px] font-normal uppercase tracking-widest text-purple-700 mb-4">
            Fuzzy Mismatches
          </span>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold text-purple-600">
              {data_health.fuzzy_errors}
            </span>
            <Fingerprint size={24} className="text-purple-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
