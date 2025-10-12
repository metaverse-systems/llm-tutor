import type { TestPromptResult } from "@metaverse-systems/llm-tutor-shared";
import { useState } from "react";

interface TestTranscriptPanelProps {
  transcripts: TestPromptResult[];
  profileName: string;
}

function formatLatency(latency: number | null | undefined): string {
  if (typeof latency !== "number" || Number.isNaN(latency) || latency < 0) {
    return "—";
  }

  if (latency < 1000) {
    return `${Math.round(latency)} ms`;
  }

  const seconds = latency / 1000;
  return `${seconds.toFixed(1)} s`;
}

function getStatusLabel(status: "success" | "error" | "timeout"): string {
  switch (status) {
    case "success":
      return "Success";
    case "error":
      return "Error";
    case "timeout":
      return "Timeout";
  }
}

function getStatusClass(status: "success" | "error" | "timeout"): string {
  switch (status) {
    case "success":
      return "settings__transcript-status--success";
    case "error":
      return "settings__transcript-status--error";
    case "timeout":
      return "settings__transcript-status--timeout";
  }
}

export const TestTranscriptPanel: React.FC<TestTranscriptPanelProps> = ({
  transcripts,
  profileName
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (transcripts.length === 0) {
    return null;
  }

  const toggleExpanded = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="settings__transcript-panel" role="region" aria-label="Test transcript history">
      <h4 className="settings__transcript-title">Transcript History</h4>
      
      {transcripts.map((transcript, index) => {
        const isExpanded = expandedIndex === index;
        const transcriptData = transcript.transcript;
        
        // Handle case where transcript is not yet populated
        if (!transcriptData) {
          return null;
        }
        
        const hasMessages = transcriptData.messages?.length > 0;
        
        return (
          <div
            key={index}
            className="settings__transcript-item"
            data-testid={`transcript-${index}`}
          >
            <button
              type="button"
              className="settings__transcript-header"
              onClick={() => toggleExpanded(index)}
              aria-expanded={isExpanded}
              aria-controls={`transcript-content-${index}`}
            >
              <div className="settings__transcript-header-content">
                <span
                  className={`settings__transcript-status ${getStatusClass(transcriptData.status)}`}
                  data-testid={`transcript-status-${index}`}
                >
                  {getStatusLabel(transcriptData.status)}
                </span>
                
                {transcriptData.latencyMs !== null && (
                  <span className="settings__transcript-latency">
                    {formatLatency(transcriptData.latencyMs)}
                  </span>
                )}
                
                {hasMessages && (
                  <span className="settings__transcript-message-count">
                    {transcriptData.messages.length} messages
                  </span>
                )}
              </div>
              
              <span
                className={`settings__transcript-toggle ${isExpanded ? "settings__transcript-toggle--expanded" : ""}`}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>

            {isExpanded && (
              <div
                id={`transcript-content-${index}`}
                className="settings__transcript-content"
                role="region"
                aria-label={`Transcript ${index + 1} details`}
              >
                {hasMessages ? (
                  <div className="settings__transcript-messages">
                    {transcriptData.messages.map((message, msgIndex) => (
                      <div
                        key={msgIndex}
                        className={`settings__transcript-message settings__transcript-message--${message.role}`}
                        data-testid={`transcript-message-${index}-${msgIndex}`}
                      >
                        <div className="settings__transcript-message-header">
                          <span className="settings__transcript-message-role">
                            {message.role === "user" ? "User" : "Assistant"}
                          </span>
                          {message.truncated && (
                            <span
                              className="settings__transcript-message-badge"
                              title="Message was truncated to 500 characters"
                            >
                              Truncated
                            </span>
                          )}
                        </div>
                        <div className="settings__transcript-message-text">
                          {message.text}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="settings__transcript-error">
                    {transcriptData.errorCode && (
                      <div className="settings__transcript-error-code">
                        Error: {transcriptData.errorCode}
                      </div>
                    )}
                    {transcriptData.remediation && (
                      <div className="settings__transcript-error-remediation">
                        {transcriptData.remediation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
