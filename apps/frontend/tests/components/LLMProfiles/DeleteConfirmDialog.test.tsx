import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LLMProfile } from "@metaverse-systems/llm-tutor-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteConfirmDialog } from "../../../src/components/LLMProfiles/DeleteConfirmDialog";

const buildProfile = (overrides: Partial<LLMProfile> = {}): LLMProfile => {
  const timestamp = Date.now();
  return {
    id: overrides.id ?? "profile-base",
    name: overrides.name ?? "Sample profile",
    providerType: overrides.providerType ?? "llama.cpp",
    endpointUrl: overrides.endpointUrl ?? "http://localhost:11434",
    apiKey: overrides.apiKey ?? "***REDACTED***",
    modelId: overrides.modelId ?? null,
    isActive: overrides.isActive ?? false,
    consentTimestamp: overrides.consentTimestamp ?? null,
    createdAt: overrides.createdAt ?? timestamp,
    modifiedAt: overrides.modifiedAt ?? timestamp
  };
};

afterEach(() => {
  cleanup();
});

describe("DeleteConfirmDialog", () => {
  it("requires selecting an alternate profile when deleting the active profile", async () => {
    const activeProfile = buildProfile({ id: "profile-active", name: "Active profile", isActive: true });
    const altA = buildProfile({ id: "profile-a", name: "Azure Prod" });
    const altB = buildProfile({ id: "profile-b", name: "Local Dev" });
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteConfirmDialog
        profile={activeProfile}
        alternateProfiles={[altA, altB]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const select = screen.getByLabelText(/choose a profile to activate/i) as HTMLSelectElement;
    expect(select.value).toBe(altA.id);

    fireEvent.change(select, { target: { value: altB.id } });
    const dialog = screen.getByTestId("delete-confirm-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(altB.id);
    });
  });

  it("disables deletion when no alternate profiles exist", () => {
    const activeProfile = buildProfile({ id: "profile-only", name: "Only profile", isActive: true });

    render(
      <DeleteConfirmDialog
        profile={activeProfile}
        alternateProfiles={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();
    expect(screen.getByText(/add another profile before deleting/i)).toBeInTheDocument();
  });

  it("confirms deletion immediately for inactive profiles", async () => {
    const inactiveProfile = buildProfile({ id: "profile-inactive", name: "Inactive", isActive: false });
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteConfirmDialog
        profile={inactiveProfile}
        alternateProfiles={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByTestId("delete-confirm-dialog");
    expect(within(dialog).queryByLabelText(/choose a profile/i)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(undefined);
    });
  });

  it("surfaces errors when deletion fails", async () => {
    const inactiveProfile = buildProfile({ id: "profile-error", name: "Errored" });
    const onConfirm = vi.fn().mockRejectedValue(new Error("Vault write failed"));

    render(
      <DeleteConfirmDialog
        profile={inactiveProfile}
        alternateProfiles={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByTestId("delete-confirm-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Vault write failed");
    });
  });
});
