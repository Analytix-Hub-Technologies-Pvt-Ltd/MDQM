import React, { useState } from "react";
import QuarantineList from "../pages/QuarantineList";
import ValidationErrors from "../pages/ValidationErrors";
import FuzzyErrors from "../pages/FuzzyErrors"; 

export default function QuarantineSection() {
  // State to track which page we are on: "list", "validation", or "fuzzy"
  const [currentView, setCurrentView] = useState("list");

  // State to remember exactly which job and table the user clicked
  const [selectedData, setSelectedData] = useState({
    jobId: null,
    tableId: null,
    tableName: "",
  });

  // Navigation Handlers
  const handleGoToValidation = (jobId, tableId, tableName) => {
    setSelectedData({ jobId, tableId, tableName });
    setCurrentView("validation");
  };

  const handleGoToFuzzy = (jobId, tableId, tableName) => {
    setSelectedData({ jobId, tableId, tableName });
    setCurrentView("fuzzy");
  };

  const handleBackToList = () => {
    setCurrentView("list");
    setSelectedData({ jobId: null, tableId: null, tableName: "" });
  };

  return (
    <div className="h-full w-full flex">
      {/* Show the Main List if currentView is "list" */}
      {currentView === "list" && (
        <QuarantineList
          onNavigateToValidation={handleGoToValidation}
          onNavigateToFuzzy={handleGoToFuzzy}
        />
      )}

      {/* Show Validation Details if currentView is "validation" */}
      {currentView === "validation" && (
        <ValidationErrors
          jobId={selectedData.jobId}
          tableId={selectedData.tableId}
          onBack={handleBackToList}
        />
      )}

     {currentView === "fuzzy" && (
        <FuzzyErrors 
          jobId={selectedData.jobId} 
          tableId={selectedData.tableId} 
          onBack={handleBackToList} 
        />
      )}
    </div>
  );
}
