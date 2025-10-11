import type { LLMProfile, ProviderType } from "@metaverse-systems/llm-tutor-shared";
import { ProviderTypeSchema } from "@metaverse-systems/llm-tutor-shared/llm";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { z } from "zod";

import type { CreateProfileInput, UpdateProfileInput } from "../../hooks/useLLMProfiles";

const MAX_ENDPOINT_LENGTH = 2048;

const AZURE_HOST_SUFFIX = ".openai.azure.com";

const azureHostPattern = new RegExp(`${AZURE_HOST_SUFFIX.replaceAll('.', '\\.')}$`, "i");

const providerTypeSchema: z.ZodEnum<["llama.cpp", "azure", "custom"]> =
  ProviderTypeSchema as unknown as z.ZodEnum<["llama.cpp", "azure", "custom"]>;

const profileFormSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }).max(100, { message: "Name must be 100 characters or less" }),
    providerType: providerTypeSchema,
    endpointUrl: z
      .string()
      .min(1, { message: "Endpoint URL is required" })
      .max(MAX_ENDPOINT_LENGTH, { message: "Endpoint URL is too long" }),
    apiKey: z.string().min(1, { message: "API key is required" }).max(500, { message: "API key must be 500 characters or less" }),
    modelId: z
      .string()
      .max(200, { message: "Model or deployment name must be 200 characters or less" })
      .optional(),
    consent: z.boolean()
  })
  .superRefine((data, ctx) => {
    let parsedUrl: URL | null = null;

    try {
      parsedUrl = new URL(data.endpointUrl);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endpointUrl"], message: "Enter a valid URL" });
      return;
    }

    const host = parsedUrl.hostname.toLowerCase();

    if (data.providerType === "llama.cpp") {
      const isLocalHost = host === "localhost" || host === "127.0.0.1" || host.startsWith("127.");

      if (!isLocalHost) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endpointUrl"],
          message: "Local providers must use localhost or 127.0.0.1"
        });
      }
    } else {
      if (parsedUrl.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endpointUrl"],
          message: "Remote providers require https:// URLs"
        });
      }

      if (!data.consent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["consent"],
          message: "You must grant consent to continue"
        });
      }

      if (data.providerType === "azure") {
        if (!azureHostPattern.test(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endpointUrl"],
            message: "Azure endpoints must end with .openai.azure.com"
          });
        }

        const rawModelId = typeof data.modelId === "string" ? data.modelId : "";
        const trimmedModelId = rawModelId.trim();
        if (trimmedModelId.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["modelId"],
            message: "Deployment name is required for Azure"
          });
        }
      }
    }
  });

interface ProfileFormValues {
  name: string;
  providerType: ProviderType;
  endpointUrl: string;
  apiKey: string;
  modelId: string;
  consent: boolean;
}

type FormField = keyof ProfileFormValues;

type SubmitKind = "created" | "updated";

export interface ProfileFormProps {
  mode: "create" | "edit";
  profile?: LLMProfile;
  createProfile: (payload: CreateProfileInput) => Promise<LLMProfile>;
  updateProfile: (id: string, payload: UpdateProfileInput) => Promise<LLMProfile>;
  onRequestClose: () => void;
  onSubmitted?: (profile: LLMProfile, kind: SubmitKind) => void;
  onError?: (message: string) => void;
  defaultProviderType?: ProviderType;
  defaultConsentTimestamp?: number | null;
}

interface FieldErrorState {
  name?: string;
  providerType?: string;
  endpointUrl?: string;
  apiKey?: string;
  modelId?: string;
  consent?: string;
}

const DEFAULT_VALUES: ProfileFormValues = {
  name: "",
  providerType: "llama.cpp",
  endpointUrl: "",
  apiKey: "",
  modelId: "",
  consent: false
};

export const ProfileForm: React.FC<ProfileFormProps> = ({
  mode,
  profile,
  createProfile,
  updateProfile,
  onRequestClose,
  onSubmitted,
  onError,
  defaultProviderType,
  defaultConsentTimestamp
}) => {
  if (mode === "edit" && !profile) {
    throw new Error("ProfileForm in edit mode requires a profile");
  }

  const dialogTitleId = useId();
  const descriptionId = useId();

  const initialValues = useMemo<ProfileFormValues>(() => {
    if (mode === "edit" && profile) {
      return {
        name: profile.name,
        providerType: profile.providerType,
        endpointUrl: profile.endpointUrl,
        apiKey: "",
        modelId: profile.modelId ?? "",
        consent: profile.providerType === "llama.cpp" ? false : profile.consentTimestamp !== null
      };
    }

    const provider = defaultProviderType ?? DEFAULT_VALUES.providerType;
    return {
      ...DEFAULT_VALUES,
      providerType: provider,
      consent: provider === "llama.cpp" ? false : true
    };
  }, [defaultProviderType, mode, profile]);

  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrorState>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const consentBaselineRef = useRef<number | null>(defaultConsentTimestamp ?? null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const providerInputRef = useRef<HTMLSelectElement>(null);
  const endpointInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const modelIdInputRef = useRef<HTMLInputElement>(null);
  const consentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(initialValues);
    setErrors({});
    setFormError(null);
    setIsSubmitting(false);
    consentBaselineRef.current = defaultConsentTimestamp ?? null;
  }, [defaultConsentTimestamp, initialValues]);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const requiresConsent = values.providerType !== "llama.cpp";
  const requiresModelId = values.providerType === "azure";

  const fieldRefs: Record<FormField, RefObject<HTMLElement>> = {
    name: nameInputRef,
    providerType: providerInputRef,
    endpointUrl: endpointInputRef,
    apiKey: apiKeyInputRef,
    modelId: modelIdInputRef,
    consent: consentInputRef
  } as const;

  const clearFieldError = (field: FormField) => {
    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    }
    if (formError) {
      setFormError(null);
    }
  };

  const handleChange = (field: FormField, value: string | boolean) => {
    setValues((previous) => {
      if (field === "providerType") {
        const provider = value as ProviderType;
        return {
          ...previous,
          providerType: provider,
          consent: provider === "llama.cpp" ? false : previous.consent,
          modelId: provider === "llama.cpp" ? "" : previous.modelId
        };
      }

      if (field === "consent") {
        return { ...previous, consent: Boolean(value) };
      }

      return { ...previous, [field]: value };
    });

    if (field === "providerType") {
      clearFieldError("modelId");
      clearFieldError("consent");
    }

    clearFieldError(field);
  };

  const focusFirstError = (fieldState: FieldErrorState) => {
    const order: FormField[] = ["name", "providerType", "endpointUrl", "apiKey", "modelId", "consent"];

    for (const key of order) {
      if (fieldState[key]) {
        const ref = fieldRefs[key];
        ref?.current?.focus();
        break;
      }
    }
  };

  const handleCancel = () => {
    onRequestClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setFormError(null);

    const candidate = {
      name: values.name.trim(),
      providerType: values.providerType,
      endpointUrl: values.endpointUrl.trim(),
      apiKey: values.apiKey,
      modelId: values.modelId.trim() || undefined,
      consent: values.providerType === "llama.cpp" ? true : values.consent
    } as const;

    const result = profileFormSchema.safeParse(candidate);

    if (!result.success) {
      const fieldState: FieldErrorState = {};

      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in candidate) {
          fieldState[field as FormField] = issue.message;
        }
      }

      setErrors(fieldState);
      setFormError("Please correct the highlighted fields");
      focusFirstError(fieldState);
      setIsSubmitting(false);
      return;
    }

    try {
      const payloadBase = {
        name: result.data.name,
        providerType: result.data.providerType,
        endpointUrl: result.data.endpointUrl,
        apiKey: result.data.apiKey,
        modelId: result.data.modelId ?? null,
        consentTimestamp:
          result.data.providerType === "llama.cpp"
            ? null
            : mode === "edit" && profile?.consentTimestamp
              ? profile.consentTimestamp
              : consentBaselineRef.current ?? Date.now()
      } as const;

      let savedProfile: LLMProfile | null = null;
      let kind: SubmitKind = "created";

      if (mode === "create") {
        savedProfile = await createProfile(payloadBase);
      } else if (profile) {
        const { consentTimestamp, ...rest } = payloadBase;
        const updatePayload: UpdateProfileInput = {
          ...rest,
          modelId: rest.modelId,
          consentTimestamp
        };
        savedProfile = await updateProfile(profile.id, updatePayload);
        kind = "updated";
      }

      if (savedProfile) {
        if (onSubmitted) {
          onSubmitted(savedProfile, kind);
          return;
        }

        onRequestClose();
        return;
      }

      onRequestClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile";
      setFormError(message);
      onError?.(message);
      setIsSubmitting(false);
      return;
    }
  };

  return (
    <div className="settings__dialog" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} aria-describedby={descriptionId} data-testid="profile-form-dialog">
      <div className="settings__dialog-card app-card">
        <header className="settings__dialog-header app-stack-xs">
          <h2 id={dialogTitleId}>{mode === "create" ? "Add profile" : `Edit ${profile?.name ?? "profile"}`}</h2>
          <p id={descriptionId} className="settings__dialog-subtitle">
            Provide connection details for your LLM provider. Required fields are marked with *.
          </p>
        </header>
        <form className="settings__dialog-form app-stack-md" onSubmit={handleSubmit} noValidate data-testid="profile-form">
          <div className="app-stack-sm">
            <label htmlFor="profile-name">Name *</label>
            <input
              ref={nameInputRef}
              id="profile-name"
              type="text"
              value={values.name}
              onChange={(event) => handleChange("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "profile-name-error" : undefined}
              maxLength={100}
              required
            />
            {errors.name ? (
              <p id="profile-name-error" className="settings__field-error">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="app-stack-sm">
            <label htmlFor="profile-provider">Provider *</label>
            <select
              ref={providerInputRef}
              id="profile-provider"
              value={values.providerType}
              onChange={(event) => handleChange("providerType", event.target.value as ProviderType)}
              aria-invalid={Boolean(errors.providerType)}
              aria-describedby={errors.providerType ? "profile-provider-error" : undefined}
              required
            >
              <option value="llama.cpp">Local llama.cpp</option>
              <option value="azure">Azure OpenAI</option>
              <option value="custom">Custom HTTP</option>
            </select>
            {errors.providerType ? (
              <p id="profile-provider-error" className="settings__field-error">
                {errors.providerType}
              </p>
            ) : null}
          </div>

          <div className="app-stack-sm">
            <label htmlFor="profile-endpoint">Endpoint URL *</label>
            <input
              ref={endpointInputRef}
              id="profile-endpoint"
              type="url"
              value={values.endpointUrl}
              onChange={(event) => handleChange("endpointUrl", event.target.value)}
              aria-invalid={Boolean(errors.endpointUrl)}
              aria-describedby={errors.endpointUrl ? "profile-endpoint-error" : undefined}
              required
            />
            {errors.endpointUrl ? (
              <p id="profile-endpoint-error" className="settings__field-error">
                {errors.endpointUrl}
              </p>
            ) : (
              <p className="settings__field-hint">
                {values.providerType === "llama.cpp"
                  ? "Example: http://localhost:11434"
                  : values.providerType === "azure"
                    ? "Example: https://my-instance.openai.azure.com"
                    : "Use the HTTPS endpoint provided by your service"}
              </p>
            )}
          </div>

          <div className="app-stack-sm">
            <label htmlFor="profile-api-key">API key *</label>
            <input
              ref={apiKeyInputRef}
              id="profile-api-key"
              type="password"
              value={values.apiKey}
              onChange={(event) => handleChange("apiKey", event.target.value)}
              aria-invalid={Boolean(errors.apiKey)}
              aria-describedby={errors.apiKey ? "profile-api-key-error" : undefined}
              required
            />
            {errors.apiKey ? (
              <p id="profile-api-key-error" className="settings__field-error">
                {errors.apiKey}
              </p>
            ) : mode === "edit" ? (
              <p className="settings__field-hint">Enter a new key to replace the stored value.</p>
            ) : null}
          </div>

          <div className="app-stack-sm">
            <label htmlFor="profile-model">Model / deployment</label>
            <input
              ref={modelIdInputRef}
              id="profile-model"
              type="text"
              value={values.modelId}
              onChange={(event) => handleChange("modelId", event.target.value)}
              aria-invalid={Boolean(errors.modelId)}
              aria-describedby={errors.modelId ? "profile-model-error" : undefined}
              required={requiresModelId}
            />
            {errors.modelId ? (
              <p id="profile-model-error" className="settings__field-error">
                {errors.modelId}
              </p>
            ) : (
              <p className="settings__field-hint">
                {requiresModelId
                  ? "Azure requires a deployment name configured for your endpoint"
                  : "Optional label to help identify this profile"}
              </p>
            )}
          </div>

          {requiresConsent ? (
            <fieldset className="settings__consent" aria-describedby={errors.consent ? "profile-consent-error" : undefined}>
              <legend>Consent</legend>
              <label className="settings__consent-option">
                <input
                  ref={consentInputRef}
                  type="checkbox"
                  checked={values.consent}
                  onChange={(event) => handleChange("consent", event.target.checked)}
                  aria-invalid={Boolean(errors.consent)}
                  required
                />
                <span>
                  I understand that prompts and responses will be sent to a remote provider and consent to shared data processing.
                </span>
              </label>
              {errors.consent ? (
                <p id="profile-consent-error" className="settings__field-error">
                  {errors.consent}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {formError ? (
            <div className="settings__form-error" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="settings__dialog-actions">
            <button type="button" className="app-button" onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="app-button--primary" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? "Saving…" : mode === "create" ? "Create profile" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileForm;
