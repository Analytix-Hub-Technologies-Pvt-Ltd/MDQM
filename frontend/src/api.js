import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const readFilenameFromDisposition = (disposition = "", fallback = "download") => {
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch {
            return utf8Match[1];
        }
    }
    const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
    return plainMatch?.[1] || fallback;
};

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

export const uploadCsvToJob = async (jobId, file, previewEdits = []) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("preview_edits", JSON.stringify(previewEdits));
    return axios.post(`${API_URL}/jobs/${jobId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
};

export const previewCsvFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return axios.post(`${API_URL}/files/preview`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
};

export const previewCsvFileFromPath = async (filePath) => {
    return axios.post(`${API_URL}/files/preview-from-path`, { file_path: filePath });
};

export const createNewJob = async (jobName) => {
    return axios.post(`${API_URL}/jobs/create`, { job_name: jobName });
};

export const uploadCsvPathToJob = async (jobId, filePath) => {
    return axios.post(`${API_URL}/jobs/${jobId}/upload-from-path`, { file_path: filePath });
};

// Note: DB Connection and Download endpoints will require specific backend logic
export const connectToDb = async (credentials) => {
    return axios.post(`${API_URL}/db/connect`, credentials);
};

export const listDatabases = async (credentials) => {
    return axios.post(`${API_URL}/db/list-databases`, credentials);
};

export const listSchemasTables = async (payload) => {
    return axios.post(`${API_URL}/db/list-schemas-tables`, payload);
};

export const previewDbTable = async (payload) => {
    return axios.post(`${API_URL}/db/preview-table`, payload);
};

export const getDbLookupValues = async (payload) => {
    return axios.post(`${API_URL}/db/lookup-values`, payload);
};

export const getDbTableColumns = async (payload) => {
    return axios.post(`${API_URL}/db/table-columns`, payload);
};

export const listSavedConnections = async () => {
    return axios.get(`${API_URL}/db/connections`);
};

export const saveDbConnection = async (payload) => {
    return axios.post(`${API_URL}/db/connections`, payload);
};

export const testDbConnection = async (payload) => {
    return axios.post(`${API_URL}/db/test-connection`, payload);
};

export const exportResultsToDb = async (payload) => {
    return axios.post(`${API_URL}/db/export-results`, payload);
};

export const emailTableOutput = async (tableId, payload) => {
    return axios.post(`${API_URL}/tables/${tableId}/email`, payload);
};

export const downloadTableOutputCsv = async (jobId, tableId) => {
    const res = await axios.get(`${API_URL}/tables/${jobId}/${tableId}/download-csv`, {
        responseType: "blob",
    });
    const filename = readFilenameFromDisposition(
        res?.headers?.["content-disposition"] || "",
        `table_${tableId}_results.csv`
    );
    return { blob: res.data, filename };
};

export const downloadTableOutputExcel = async (jobId, tableId) => {
    const res = await axios.get(`${API_URL}/tables/${jobId}/${tableId}/download`, {
        responseType: "blob",
    });
    const filename = readFilenameFromDisposition(
        res?.headers?.["content-disposition"] || "",
        `table_${tableId}_results.xlsx`
    );
    return { blob: res.data, filename };
};

export const uploadTableOutputToSharePoint = async (tableId, payload) => {
    return axios.post(`${API_URL}/tables/${tableId}/sharepoint-upload`, payload);
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
export const getFuzzyDetails = async (jobId, tableId, params = {}) => {
    return axios.get(`${API_URL}/quarantine/jobs/${jobId}/tables/${tableId}/fuzzy`, { params });
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