import type { LLMProfile, ProviderType, TestPromptResult } from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useMemo, useRef, useState } from "react";

import { ConsentDialog, type ConsentDecision } from "../../components/LLMProfiles/ConsentDialog";
import { ProfileForm } from "../../components/LLMProfiles/ProfileForm";
import { useLLMProfiles } from "../../hooks/useLLMProfiles";

interface TestConnectionState {
  status: "idle" | "loading" | "success" | "error";
  result?: TestPromptResult;
  error?: string;
}

interface DiscoveryStatus {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

const INITIAL_DISCOVERY_STATUS: DiscoveryStatus = {
  status: "idle",
  message: ""
};

function formatProvider(type: LLMProfile["providerType"]): string {
  switch (type) {
    case "llama.cpp":
      return "Local llama.cpp";
    case "azure":
      return "Azure OpenAI";
    case "custom":
      return "Custom HTTP";
    default:
      return type;
  }
}

function formatHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return "Unknown";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function formatLatency(latency: number | null | undefined): string {
  if (typeof latency !== "number") {
    return "–";
  }

  if (latency < 1000) {
    return `${latency} ms`;
  }

  const seconds = latency / 1000;
  return `${seconds.toFixed(1)} s`;
}

export const LLMProfiles: React.FC = () => {
  const {
    profiles,
    loading,
    error,
    encryptionAvailable,
    createProfile,
    updateProfile,
    fetchProfiles,
    deleteProfile,
    activateProfile,
    testPrompt,
    discoverProfiles
  } = useLLMProfiles();

  const [testStates, setTestStates] = useState<Record<string, TestConnectionState>>({});
  const [ariaStatusMessage, setAriaStatusMessage] = useState<string>("");
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>(INITIAL_DISCOVERY_STATUS);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null);
  const [isConsentDialogOpen, setIsConsentDialogOpen] = useState(false);
  const [consentContext, setConsentContext] = useState<{ providerType: ProviderType; providerName: string } | null>(null);
  const [createDefaultProvider, setCreateDefaultProvider] = useState<ProviderType>("llama.cpp");
  const [createDefaultConsentTimestamp, setCreateDefaultConsentTimestamp] = useState<number | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const stashFocus = useCallback(() => {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const restoreFocus = useCallback(() => {
    const node = dialogReturnFocusRef.current;
    dialogReturnFocusRef.current = null;
    if (node) {
      window.requestAnimationFrame(() => {
        node.focus();
      });
    }
  }, []);

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.isActive && !b.isActive) {
        return -1;
      }
      if (!a.isActive && b.isActive) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [profiles]);

  const updateAriaStatus = useCallback((message: string) => {
    setAriaStatusMessage(message);
  }, []);

  const handleActivate = useCallback(
    async (profile: LLMProfile) => {
      if (profile.isActive) {
        return;
      }

      try {
        await activateProfile(profile.id);
        updateAriaStatus(`Activated ${profile.name}`);
      } catch (activationError) {
        const message = activationError instanceof Error ? activationError.message : "Failed to activate profile";
        updateAriaStatus(message);
      }
    },
    [activateProfile, updateAriaStatus]
  );

  const handleDelete = useCallback(
    async (profile: LLMProfile) => {
      try {
        await deleteProfile(profile.id);
        updateAriaStatus(`Deleted ${profile.name}`);
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "Failed to delete profile";
        updateAriaStatus(message);
      }
    },
    [deleteProfile, updateAriaStatus]
  );

  const handleTestConnection = useCallback(
    async (profile: LLMProfile) => {
      setTestStates((previous) => ({
        ...previous,
        [profile.id]: { status: "loading" }
      }));
      updateAriaStatus(`Testing ${profile.name}`);

      try {
        const result = await testPrompt(profile.id);
        setTestStates((previous) => ({
          ...previous,
          [profile.id]: { status: "success", result }
        }));
        updateAriaStatus(`Connection succeeded for ${profile.name} in ${formatLatency(result.latencyMs)}`);
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Test connection failed";
        setTestStates((previous) => ({
          ...previous,
          [profile.id]: { status: "error", error: message }
        }));
        updateAriaStatus(message);
      }
    },
    [testPrompt, updateAriaStatus]
  );

  const handleDiscover = useCallback(async () => {
    setDiscoveryStatus({ status: "loading", message: "Running auto-discovery…" });
    updateAriaStatus("Running auto-discovery");

    try {
      const result = await discoverProfiles(true);

      if (result.profileCreated) {
        setDiscoveryStatus({
          status: "success",
          message: result.discoveredUrl
            ? `Discovered llama.cpp at ${result.discoveredUrl}`
            : "Profile created from discovery"
        });
      } else if (result.discovered) {
        setDiscoveryStatus({
          status: "success",
          message: result.discoveredUrl ? `Found existing profile at ${result.discoveredUrl}` : "Discovery complete"
        });
      } else {
        setDiscoveryStatus({ status: "success", message: "No running llama.cpp instances detected" });
      }

      updateAriaStatus("Auto-discovery complete");
    } catch (discoverError) {
      const message = discoverError instanceof Error ? discoverError.message : "Auto-discovery failed";
      setDiscoveryStatus({ status: "error", message });
      updateAriaStatus(message);
    }
  }, [discoverProfiles, updateAriaStatus]);

  const openCreateDialog = useCallback(() => {
    stashFocus();
    setEditingProfile(null);
    setCreateDefaultProvider("llama.cpp");
    setCreateDefaultConsentTimestamp(null);
    setIsCreateDialogOpen(true);
  }, [stashFocus]);

  const openRemoteProviderDialog = useCallback(() => {
    stashFocus();
    setConsentContext({ providerType: "azure", providerName: "Azure OpenAI" });
    setIsConsentDialogOpen(true);
    updateAriaStatus("Consent required to add remote provider");
  }, [stashFocus, updateAriaStatus]);

  const closeFormDialog = useCallback(() => {
    setIsCreateDialogOpen(false);
    setEditingProfile(null);
    setCreateDefaultProvider("llama.cpp");
    setCreateDefaultConsentTimestamp(null);
    restoreFocus();
  }, [restoreFocus]);

  const openEditDialog = useCallback((profile: LLMProfile) => {
    stashFocus();
    setIsCreateDialogOpen(false);
    setEditingProfile(profile);
  }, [stashFocus]);

  const handleFormSubmitted = useCallback(
    (profile: LLMProfile, kind: "created" | "updated") => {
      const verb = kind === "created" ? "Created" : "Updated";
      updateAriaStatus(`${verb} ${profile.name}`);
      setIsCreateDialogOpen(false);
      setEditingProfile(null);
      setCreateDefaultProvider("llama.cpp");
      setCreateDefaultConsentTimestamp(null);
      restoreFocus();
    },
    [restoreFocus, updateAriaStatus]
  );

  const handleFormCanceled = useCallback(() => {
    closeFormDialog();
  }, [closeFormDialog]);

  const handleConsentAccepted = useCallback(
    (decision: ConsentDecision) => {
      setIsConsentDialogOpen(false);
      setConsentContext(null);
      setCreateDefaultProvider(decision.providerType);
      setCreateDefaultConsentTimestamp(decision.timestamp);
      setIsCreateDialogOpen(true);
      updateAriaStatus(`Consent granted for ${decision.providerName}`);
    },
    [updateAriaStatus]
  );

  const handleConsentCancelled = useCallback(
    (decision: ConsentDecision) => {
      setIsConsentDialogOpen(false);
      setConsentContext(null);
      setCreateDefaultProvider("llama.cpp");
      setCreateDefaultConsentTimestamp(null);
      updateAriaStatus(`Consent declined for ${decision.providerName}`);
      restoreFocus();
    },
    [restoreFocus, updateAriaStatus]
  );

  const activeConsentContext = isConsentDialogOpen && consentContext ? consentContext : null;

  return (
    <main className="settings" aria-busy={loading} data-testid="llm-profiles-page">
      <header className="settings__header app-stack-sm">
        <div className="app-stack-sm">
          <h1 className="settings__title">LLM connection profiles</h1>
          <p className="settings__subtitle">
            Manage encrypted credentials, run quick connection tests, and oversee auto-discovery results for llama.cpp and remote providers.
          </p>
        </div>
        <div className="settings__actions" role="toolbar" aria-label="Profile actions">
          <button type="button" className="app-button--primary" onClick={openCreateDialog} data-testid="add-profile-button">
            Add profile
          </button>
          <button
            type="button"
            className="app-button"
            onClick={openRemoteProviderDialog}
            data-testid="add-remote-provider-button"
          >
            Add remote provider
          </button>
          <button
            type="button"
            className="app-button"
            onClick={handleDiscover}
            disabled={discoveryStatus.status === "loading"}
            aria-busy={discoveryStatus.status === "loading"}
            data-testid="run-discovery-button"
          >
            {discoveryStatus.status === "loading" ? "Running auto-discovery…" : "Run auto-discovery"}
          </button>
          <button type="button" className="app-button--ghost" onClick={() => void fetchProfiles()} data-testid="refresh-profiles-button">
            Refresh
          </button>
        </div>
        <p className="settings__encryption" role="status" aria-live="polite">
          {encryptionAvailable ? "API keys encrypted via system keychain" : "Encryption unavailable — API keys stored in plaintext"}
        </p>
        {discoveryStatus.message ? (
          <p
            className={`settings__discovery settings__discovery--${discoveryStatus.status}`}
            role={discoveryStatus.status === "error" ? "alert" : "status"}
            data-testid="discovery-status"
            aria-live="polite"
          >
            {discoveryStatus.message}
          </p>
        ) : null}
        {error ? (
          <div className="settings__error" role="alert" data-testid="llm-profiles-error">
            {error}
          </div>
        ) : null}
      </header>

      <section className="settings__content app-stack-lg" aria-label="LLM connection profiles list">
        {loading ? (
          <div className="settings__skeleton" role="status" aria-label="Loading profiles">
            <div className="settings__skeleton-row" />
            <div className="settings__skeleton-row" />
            <div className="settings__skeleton-row" />
          </div>
        ) : null}

        {!loading && sortedProfiles.length === 0 ? (
          <div className="settings__empty app-card" role="region" aria-live="polite" data-testid="llm-profiles-empty">
            <h2 className="settings__empty-title">No profiles yet</h2>
            <p className="settings__empty-copy">
              Create your first profile to connect to a local llama.cpp instance or remote provider. We&rsquo;ll keep API keys encrypted when the system keychain is available.
            </p>
            <button type="button" className="app-button--primary" onClick={openCreateDialog}>
              Add profile
            </button>
            <button type="button" className="app-button" onClick={openRemoteProviderDialog}>
              Add remote provider
            </button>
          </div>
        ) : null}

        {sortedProfiles.length > 0 ? (
          <ul className="settings__profile-list" aria-label="LLM connection profiles">
            {sortedProfiles.map((profile) => {
              const testState = testStates[profile.id] ?? { status: "idle" };
              const isTesting = testState.status === "loading";
              const testResult = testState.result;

              return (
                <li key={profile.id} className="settings__profile-card" data-testid={`llm-profile-${profile.id}`}>
                  <div
                    className="settings__profile-card-inner app-card app-card--interactive"
                  >
                  <header className="settings__profile-header">
                    <div className="settings__profile-heading">
                      <h2>{profile.name}</h2>
                      <span className="settings__profile-provider">{formatProvider(profile.providerType)}</span>
                    </div>
                    <div className="settings__profile-badges">
                      {profile.isActive ? (
                        <span className="app-status app-status--positive" data-testid="active-profile-badge">
                          Active
                        </span>
                      ) : (
                        <span className="app-status app-status--neutral">Inactive</span>
                      )}
                      {encryptionAvailable ? (
                        <span className="app-status">Encrypted</span>
                      ) : (
                        <span className="app-status app-status--negative">Not encrypted</span>
                      )}
                    </div>
                  </header>

                  <dl className="settings__profile-meta">
                    <div>
                      <dt>Endpoint</dt>
                      <dd>{formatHostname(profile.endpointUrl)}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{profile.modelId ?? "Auto"}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                      <dd>{formatTimestamp(profile.modifiedAt)}</dd>
                    </div>
                  </dl>

                  <div className="settings__profile-actions" role="group" aria-label={`Actions for ${profile.name}`}>
                    <button
                      type="button"
                      className="app-button--secondary"
                      onClick={() => void handleActivate(profile)}
                      disabled={profile.isActive}
                    >
                      {profile.isActive ? "Active" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="app-button"
                      onClick={() => void handleTestConnection(profile)}
                      disabled={isTesting}
                      aria-busy={isTesting}
                      data-testid={`test-connection-${profile.id}`}
                    >
                      {isTesting ? "Testing…" : "Test connection"}
                    </button>
                    <button
                      type="button"
                      className="app-button"
                      onClick={() => openEditDialog(profile)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="app-button--ghost settings__delete-button"
                      onClick={() => void handleDelete(profile)}
                      onKeyDown={(event) => {
                        if (event.key === "Delete") {
                          event.preventDefault();
                          void handleDelete(profile);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="settings__profile-status" role="status" aria-live="polite">
                    {testState.status === "idle" ? "" : null}
                    {testState.status === "loading" ? "Testing connection…" : null}
                    {testState.status === "success" && testResult ? (
                      <>
                        <strong>Response</strong>
                        <p>
                          {testResult.responseText ?? "No preview available"}
                          <span className="settings__latency">Latency: {formatLatency(testResult.latencyMs)}</span>
                        </p>
                      </>
                    ) : null}
                    {testState.status === "error" && testState.error ? (
                      <p className="settings__profile-error">{testState.error}</p>
                    ) : null}
                  </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <div className="settings__sr-status" aria-live="polite" aria-atomic="true">
        {ariaStatusMessage}
      </div>

      {isCreateDialogOpen ? (
        <ProfileForm
          mode="create"
          createProfile={createProfile}
          updateProfile={updateProfile}
          onRequestClose={handleFormCanceled}
          onSubmitted={handleFormSubmitted}
          onError={updateAriaStatus}
          defaultProviderType={createDefaultProvider}
          defaultConsentTimestamp={createDefaultConsentTimestamp}
        />
      ) : null}

      {editingProfile ? (
        <ProfileForm
          mode="edit"
          profile={editingProfile}
          createProfile={createProfile}
          updateProfile={updateProfile}
          onRequestClose={handleFormCanceled}
          onSubmitted={handleFormSubmitted}
          onError={updateAriaStatus}
        />
      ) : null}

      {activeConsentContext ? (
        <ConsentDialog
          providerType={activeConsentContext.providerType}
          providerName={activeConsentContext.providerName}
          onAccept={handleConsentAccepted}
          onCancel={handleConsentCancelled}
        />
      ) : null}
    </main>
  );
};

export default LLMProfiles;
