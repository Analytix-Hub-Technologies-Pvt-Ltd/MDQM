import axios from 'axios';

const API_URL = 'http://localhost:8000';

// --- JOBS ---
export const getAllJobs = async () => {
    return axios.get(`${API_URL}/jobs`); 
};

export const createJob = async (jobName) => {
    const formData = new FormData();
    formData.append('job_name', jobName);
    return axios.post(`${API_URL}/jobs/create`, formData);
};

// --- TABLES ---
export const getTablesByJob = async (jobId) => {
    return axios.get(`${API_URL}/jobs/${jobId}/tables`);
};

// In frontend/src/api.js
export const getTableDetails = async (jobId, tableId) => {
    // Now passing both IDs in the URL
    return axios.get(`${API_URL}/tables/${jobId}/${tableId}/details`);
};

// --- RULES ---
export const addRule = async (payload) => {
    return axios.post(`${API_URL}/rules/add`, payload);
};

export const toggleRule = async (ruleId, isActive) => {
    return axios.put(`${API_URL}/rules/${ruleId}/toggle`, { is_active: isActive });
};

export const deleteRule = async (ruleId) => {
    return axios.delete(`${API_URL}/rules/${ruleId}`);
};

// --- NEW EDITING FUNCTIONS ---
export const updateRule = async (ruleId, payload) => {
    return axios.put(`${API_URL}/rules/${ruleId}`, payload);
};

export const getMasterData = async (jobId, tableId) => {
    return axios.get(`${API_URL}/master-data/${jobId}/${tableId}`);
};

// Add these to your existing frontend/src/api.js

export const runJobEngine = async (jobId) => {
    return axios.post(`${API_URL}/jobs/${jobId}/run`);
};

export const deleteJob = async (jobId) => {
    return axios.delete(`${API_URL}/jobs/${jobId}`);
};

export const deleteTable = async (tableId) => {
    return axios.delete(`${API_URL}/tables/${tableId}`);
};

export const renameJob = async (jobId, newName) => {
    return axios.put(`${API_URL}/jobs/${jobId}/rename`, { name: newName });
};

export const renameTable = async (tableId, newName) => {
    return axios.put(`${API_URL}/tables/${tableId}/rename`, { name: newName });
};

export const uploadCsvToJob = async (jobId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return axios.post(`${API_URL}/jobs/${jobId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
};

export const createNewJob = async (jobName) => {
    return axios.post(`${API_URL}/jobs/create`, { job_name: jobName });
};

// Note: DB Connection and Download endpoints will require specific backend logic
export const connectToDb = async (credentials) => {
    return axios.post(`${API_URL}/db/connect`, credentials);
};

// Add to frontend/src/api.js
export const getQuarantineJobs = async () => {
    return axios.get(`${API_URL}/quarantine/jobs`);
};

export const getQuarantineTables = async (jobId) => {
    return axios.get(`${API_URL}/quarantine/jobs/${jobId}/tables`);
};

// Add to frontend/src/api.js
export const getValidationDetails = async (jobId, tableId) => {
    return axios.get(`${API_URL}/quarantine/jobs/${jobId}/tables/${tableId}/validation`);
};

export const updateQuarantineError = async (logId, newValue) => {
    return axios.put(`${API_URL}/quarantine/errors/${logId}`, { new_value: newValue });
};

export const deleteQuarantineError = async (logId) => {
    return axios.delete(`${API_URL}/quarantine/errors/${logId}`);
};

// Add to frontend/src/api.js
export const getFuzzyDetails = async (jobId, tableId) => {
    return axios.get(`${API_URL}/quarantine/jobs/${jobId}/tables/${tableId}/fuzzy`);
};

export const addToMasterData = async (jobId, tableId, newMaster) => {
    return axios.post(`${API_URL}/quarantine/jobs/${jobId}/tables/${tableId}/master`, { new_master: newMaster });
};

export const replaceFuzzyValue = async (jobId, tableId, rowId, colName, newValue) => {
    return axios.put(`${API_URL}/quarantine/jobs/${jobId}/tables/${tableId}/fuzzy/replace`, {
        row_id: rowId,
        column_name: colName,
        new_value: newValue
    });
};

// Add to frontend/src/api.js
export const getDashboardSummary = async () => {
    return axios.get(`${API_URL}/dashboard/summary`);
};

export const removeMasterValue = async (jobId, tableId, value) => {
    return axios.delete(`${API_URL}/master-data/remove`, {
        data: { 
            job_id: jobId, 
            table_id: tableId, 
            value: value 
        }
    });
};

export const getColumnStats = async (tableId) => {
    return axios.get(`${API_URL}/tables/${tableId}/columns/stats`);
};

export const renameColumn = async (tableId, oldName, newName) => {
    return axios.put(`${API_URL}/tables/${tableId}/columns/rename`, {
        old_name: oldName,
        new_name: newName
    });
};

export const standardizeDates = (tableId, columnName) => {
  return axios.post(`${API_URL}/tables/${tableId}/standardize-dates`, {
    column_name: columnName
  });
};