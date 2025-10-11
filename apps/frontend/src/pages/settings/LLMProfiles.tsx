import type { LLMProfile, ProviderType } from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useMemo, useRef, useState } from "react";

import { ConsentDialog, type ConsentDecision } from "../../components/LLMProfiles/ConsentDialog";
import { DeleteConfirmDialog } from "../../components/LLMProfiles/DeleteConfirmDialog";
import { ProfileForm } from "../../components/LLMProfiles/ProfileForm";
import { TestConnectionButton } from "../../components/LLMProfiles/TestConnectionButton";
import { useLLMProfiles } from "../../hooks/useLLMProfiles";

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

  const [ariaStatusMessage, setAriaStatusMessage] = useState<string>("");
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>(INITIAL_DISCOVERY_STATUS);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null);
  const [isConsentDialogOpen, setIsConsentDialogOpen] = useState(false);
  const [consentContext, setConsentContext] = useState<{ providerType: ProviderType; providerName: string } | null>(null);
  const [createDefaultProvider, setCreateDefaultProvider] = useState<ProviderType>("llama.cpp");
  const [createDefaultConsentTimestamp, setCreateDefaultConsentTimestamp] = useState<number | null>(null);
  const [deleteDialogProfile, setDeleteDialogProfile] = useState<LLMProfile | null>(null);
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

  const openDeleteDialog = useCallback(
    (profile: LLMProfile) => {
      stashFocus();
      setDeleteDialogProfile(profile);
      updateAriaStatus(`Confirm deletion for ${profile.name}`);
    },
    [stashFocus, updateAriaStatus]
  );

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogProfile(null);
    restoreFocus();
  }, [restoreFocus]);

  const handleDeleteCancelled = useCallback(() => {
    if (deleteDialogProfile) {
      updateAriaStatus(`Cancelled deleting ${deleteDialogProfile.name}`);
    } else {
      updateAriaStatus("Deletion cancelled");
    }

    closeDeleteDialog();
  }, [closeDeleteDialog, deleteDialogProfile, updateAriaStatus]);

  const handleDeleteConfirmed = useCallback(
    async (alternateId?: string) => {
      const target = deleteDialogProfile;
      if (!target) {
        return;
      }

      try {
        await deleteProfile(target.id, alternateId);
        updateAriaStatus(`Deleted ${target.name}`);
        setDeleteDialogProfile(null);
        restoreFocus();
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "Failed to delete profile";
        updateAriaStatus(message);
        throw deleteError instanceof Error ? deleteError : new Error(message);
      }
    },
    [deleteDialogProfile, deleteProfile, restoreFocus, updateAriaStatus]
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
  const deleteDialogAlternates = useMemo(() => {
    if (!deleteDialogProfile) {
      return [] as LLMProfile[];
    }

    return sortedProfiles.filter((profile) => profile.id !== deleteDialogProfile.id);
  }, [deleteDialogProfile, sortedProfiles]);

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
                      data-testid={`activate-profile-${profile.id}`}
                    >
                      {profile.isActive ? "Active" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="app-button"
                      onClick={() => openEditDialog(profile)}
                      data-testid={`edit-profile-${profile.id}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="app-button--ghost settings__delete-button"
                      onClick={() => openDeleteDialog(profile)}
                      onKeyDown={(event) => {
                        if (event.key === "Delete") {
                          event.preventDefault();
                          openDeleteDialog(profile);
                        }
                      }}
                      data-testid={`delete-profile-${profile.id}`}
                    >
                      Delete
                    </button>
                  </div>
                  <TestConnectionButton
                    profile={profile}
                    testPrompt={testPrompt}
                    announce={updateAriaStatus}
                  />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <div className="settings__sr-status" aria-live="polite" aria-atomic="true" data-testid="llm-status-announcer">
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

      {deleteDialogProfile ? (
        <DeleteConfirmDialog
          profile={deleteDialogProfile}
          alternateProfiles={deleteDialogAlternates}
          onConfirm={handleDeleteConfirmed}
          onCancel={handleDeleteCancelled}
        />
      ) : null}
    </main>
  );
};

export default LLMProfiles;
