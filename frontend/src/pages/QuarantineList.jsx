import React, { useState, useEffect } from "react";
import { getQuarantineJobs, getQuarantineTables } from "../api";
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Fingerprint,
} from "lucide-react";

export default function QuarantineList({
  onNavigateToValidation,
  onNavigateToFuzzy,
}) {
  const [jobs, setJobs] = useState([]);
  const [tables, setTables] = useState({});
  const [expandedJob, setExpandedJob] = useState(null);

  useEffect(() => {
    fetchQuarantineJobs();
  }, []);

  const fetchQuarantineJobs = async () => {
    try {
      const res = await getQuarantineJobs();
      setJobs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleJob = async (jobId) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    if (!tables[jobId]) {
      try {
        const res = await getQuarantineTables(jobId);
        setTables((prev) => ({ ...prev, [jobId]: res.data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto">
      {/* HEADER */}
      <div className="p-4 h-24 border-b border-[#A1A3AF] border-opacity-20 flex justify-between items-center pr-8">
        <div>
          <h1 className="text-4xl pl-4 font-thin tracking-tighter uppercase">
            Quarantine Zone
          </h1>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-4">
        {jobs.length === 0 ? (
          <div className="text-center py-20 text-gray-400 border border-dashed border-gray-300">
            <h2 className="text-xl uppercase tracking-widest mb-2">
              System Clear
            </h2>
            <p className="text-xs">
              No quarantined data found across any jobs.
            </p>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.job_id}
              className="border border-[#23243B] bg-white shadow-sm"
            >
              {/* JOB CARD (Requirement 11) */}
              <div
                className="p-6 cursor-pointer bg-white hover:bg-[#e5e9fd] transition-colors"
                onClick={() => toggleJob(job.job_id)}
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-4">
                    {expandedJob === job.job_id ? (
                      <ChevronDown size={20} className="text-gray-600" />
                    ) : (
                      <ChevronRight size={20} className="text-gray-400" />
                    )}
                    <div>
                      <h2 className="text-xl font-normal uppercase text-[#23243B]">
                        {job.job_name}
                      </h2>
                      <span className="text-[12px] text-gray-400">
                        JOB ID: {job.job_id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 border-t border-[#23243B] pl-9 pt-4 text-xs">
                  <div>
                    <span className="block text-gray-400 uppercase text-[12px] mb-1">
                      Tables Affected
                    </span>
                    <span className="text-lg font-bold">
                      {job.total_tables}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 uppercase text-[12px] mb-1">
                      Total Errors
                    </span>
                    <span className="text-lg font-bold">
                      {job.total_errors}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 uppercase text-[12px] mb-1">
                      Validation Errors
                    </span>
                    <span className="text-lg font-bold">
                      {job.validation_errors}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 uppercase text-[12px] mb-1">
                      Fuzzy Errors
                    </span>
                    <span className="text-lg font-bold">
                      {job.fuzzy_errors}
                    </span>
                  </div>
                </div>
              </div>

              {/* EXPANDED TABLES LIST (Requirement 12) */}
              {expandedJob === job.job_id && (
                <div className="bg-[#FDFDFD] p-6">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Quarantined Tables
                  </h3>
                  <div className="flex flex-col gap-3">
                    {tables[job.job_id]?.map((table) => (
                      <div
                        key={table.table_id}
                        className="bg-white border p-4 flex items-center justify-between border-gray transition-colors"
                      >
                        <div className="w-1/3">
                          <span className="text-[12px] font-bold uppercase block text-[#23243B]">
                            {table.table_name}
                          </span>
                          <span className="text-[12px] text-gray-400">
                            ID: {table.table_id} • ROWS: {table.total_rows} •
                            COLS: {table.total_columns}
                          </span>
                        </div>

                        <div className="flex gap-4 w-2/3 justify-end">
                          {/* Validation Button */}
                          <button
                            onClick={() =>
                              onNavigateToValidation(
                                job.job_id,
                                table.table_id,
                                table.table_name,
                                table.validation_errors,
                              )
                            }
                            disabled={table.validation_errors === 0}
                            className={`flex items-center gap-2 px-6 py-3 text-xs font-medium uppercase tracking-widest transition-colors ${
                              table.validation_errors > 0
                                ? "bg-[#e5e9fd] text-[#23243B] border hover:bg-[#23243B] hover:text-white"
                                : "bg-[#e5e9fd] text-gray-300 cursor-not-allowed"
                            }`}
                          >
                            Validation: {table.validation_errors}
                          </button>

                          {/* Fuzzy Button */}
                          <button
                            onClick={() =>
                              onNavigateToFuzzy(
                                job.job_id,
                                table.table_id,
                                table.table_name,
                                table.fuzzy_errors,
                              )
                            }
                            disabled={table.fuzzy_errors === 0}
                            className={`flex items-center gap-2 px-6 py-3 text-xs font-medium uppercase tracking-widest transition-colors ${
                              table.fuzzy_errors > 0
                                ? "bg-[#e5e9fd] text-[#23243B] border hover:bg-[#23243B] hover:text-white"
                                : "bg-[#e5e9fd] text-gray-300 cursor-not-allowed"
                            }`}
                          >
                            Fuzzy: {table.fuzzy_errors}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
