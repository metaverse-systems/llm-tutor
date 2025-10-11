# LLM Provider Contracts

**Feature**: 007-llm-connection-management  
**Phase**: 1 (Design & Contracts)  
**Date**: 2025-10-10

## Overview

External HTTP contracts for communicating with LLM providers (llama.cpp, Azure OpenAI, custom OpenAI-compatible endpoints). All providers use JSON payloads with OpenAI-compatible formats where applicable.

---

## 1. llama.cpp Provider

**Base URL**: `http://localhost:{port}` (ports: 8080, 8000, 11434)  
**Authentication**: None (local server)  
**API Version**: OpenAI-compatible v1

### Health Check
**Endpoint**: `GET /health`  
**Timeout**: 2s (for auto-discovery)

**Response**:
```json
{
  "status": "ok"
}
```

**Usage**: Used during auto-discovery to detect active llama.cpp servers.

---

### Completion Request (Test Prompt)
**Endpoint**: `POST /v1/completions`  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "prompt": "Hello, can you respond?",
  "max_tokens": 100,
  "temperature": 0.7,
  "stream": false
}
```

**Response (Success)**:
```json
{
  "id": "cmpl-abc123",
  "object": "text_completion",
  "created": 1728518400,
  "model": "llama-2-7b-chat",
  "choices": [
    {
      "text": "Hello! Yes, I can respond. How can I assist you today?",
      "index": 0,
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 15,
    "total_tokens": 23
  }
}
```

**Response (Error)**:
```json
{
  "error": {
    "message": "Model not loaded",
    "type": "invalid_request_error",
    "code": "model_not_loaded"
  }
}
```

**Error Codes**:
- `ECONNREFUSED`: Server not running
- `ETIMEDOUT`: Request exceeded timeout
- `model_not_loaded`: llama.cpp server has no model loaded

**Latency Measurement**:
- TTFB: Time from request start to first byte of HTTP response
- Total Time: Time from request start to complete response body

---

## 2. Azure OpenAI Provider

**Base URL**: `https://{resource-name}.openai.azure.com/openai/deployments/{deployment-name}`  
**Authentication**: `api-key: {API_KEY}` header  
**API Version**: `2024-02-15-preview` (query param)

### Completion Request (Test Prompt)
**Endpoint**: `POST /chat/completions?api-version=2024-02-15-preview`  
**Headers**:
```
api-key: sk-proj-abc123...
Content-Type: application/json
```

**Request Body**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, can you respond?"
    }
  ],
  "max_tokens": 100,
  "temperature": 0.7
}
```

**Response (Success)**:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1728518400,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! Yes, I can respond. How can I assist you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 14,
    "total_tokens": 24
  }
}
```

**Response (Error - 401 Unauthorized)**:
```json
{
  "error": {
    "code": "401",
    "message": "Access denied due to invalid subscription key or wrong API endpoint."
  }
}
```

**Response (Error - 404 Not Found)**:
```json
{
  "error": {
    "code": "DeploymentNotFound",
    "message": "The API deployment for this resource does not exist."
  }
}
```

**Response (Error - 429 Rate Limit)**:
```json
{
  "error": {
    "code": "429",
    "message": "Requests to the ChatCompletions_Create Operation under Azure OpenAI API version 2024-02-15-preview have exceeded token rate limit of your current OpenAI S0 pricing tier."
  }
}
```

**Error Codes**:
- `401`: Invalid API key
- `404`: Deployment not found or wrong endpoint URL
- `429`: Rate limit exceeded
- `503`: Service unavailable (Azure outage)

**Latency Measurement**:
- TTFB: Time from request start to first byte of HTTP response
- Total Time: Time from request start to complete response body

---

## 3. Custom OpenAI-Compatible Provider

**Base URL**: User-specified (e.g., `https://api.example.com/v1`)  
**Authentication**: `Authorization: Bearer {API_KEY}` header (standard) or `api-key: {API_KEY}` (Azure-style)  
**API Version**: Varies by provider

### Completion Request (Test Prompt)
**Endpoint**: `POST /chat/completions` or `/v1/completions`  
**Headers**:
```
Authorization: Bearer sk-abc123...
Content-Type: application/json
```

**Request Body** (Chat Completion):
```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, can you respond?"
    }
  ],
  "max_tokens": 100,
  "temperature": 0.7
}
```

**Request Body** (Legacy Completion):
```json
{
  "model": "text-davinci-003",
  "prompt": "Hello, can you respond?",
  "max_tokens": 100,
  "temperature": 0.7
}
```

**Response**: Same as Azure OpenAI (OpenAI-compatible format)

**Error Handling**: Map provider-specific error codes to user-friendly messages in `TestPromptService`.

---

## Error Mapping Strategy

### Network Errors
| Error Code      | User-Friendly Message                                      | Diagnostic Action                     |
|-----------------|------------------------------------------------------------|---------------------------------------|
| `ECONNREFUSED`  | Unable to connect to {url}. Is the server running?         | Check if server is started            |
| `ETIMEDOUT`     | Request timed out after 10 seconds. Server may be slow.    | Increase timeout or check network     |
| `ENOTFOUND`     | Could not resolve hostname {hostname}. Check the URL.      | Verify DNS or endpoint URL            |
| `ECONNRESET`    | Connection reset by server. Check server logs.             | Review server-side errors             |

### HTTP Errors (Azure OpenAI)
| Status | Error Code         | User-Friendly Message                                      |
|--------|--------------------|-----------------------------------------------------------|
| 401    | 401                | Invalid API key. Check your credentials.                  |
| 404    | DeploymentNotFound | Model deployment not found. Verify deployment name.       |
| 429    | 429                | Rate limit exceeded. Try again in a few minutes.          |
| 500    | InternalServerError| Azure service error. Check Azure status page.             |
| 503    | 503                | Service temporarily unavailable. Retry later.             |

### HTTP Errors (llama.cpp)
| Status | Error Type         | User-Friendly Message                                      |
|--------|--------------------|-----------------------------------------------------------|
| 400    | invalid_request    | Invalid request format. Check prompt syntax.              |
| 500    | server_error       | llama.cpp server error. Check server logs.                |

---

## Request Timeout Configuration

| Provider      | Timeout (Test Prompt) | Timeout (Auto-Discovery) | Notes                          |
|---------------|-----------------------|--------------------------|--------------------------------|
| llama.cpp     | 10s                   | 2s                       | Fast local inference expected  |
| Azure OpenAI  | 10s                   | N/A                      | Cold start may be slow         |
| Custom        | 10s                   | N/A                      | Configurable in future         |

---

## Response Sanitization

All responses processed by `TestPromptService`:
1. Extract completion text from `choices[0].text` or `choices[0].message.content`
2. Truncate to 500 characters (append `"..."` if truncated)
3. Strip ANSI escape codes and control characters
4. Extract model name from `model` field (or `"unknown"` if missing)
5. Calculate TTFB and total latency in milliseconds

---

## Example Provider Configurations

### llama.cpp (Local)
```typescript
{
  name: "Local llama.cpp",
  providerType: "llama.cpp",
  endpointUrl: "http://localhost:8080",
  apiKey: "", // No key required; empty string stored
  modelId: null, // Auto-detected from /health or /v1/models
  consentTimestamp: null, // Not required for local
}
```

### Azure OpenAI
```typescript
{
  name: "Azure OpenAI Prod",
  providerType: "azure",
  endpointUrl: "https://my-resource.openai.azure.com/openai/deployments/gpt-4",
  apiKey: "sk-proj-abc123...", // Encrypted
  modelId: "gpt-4", // Deployment name
  consentTimestamp: 1728518400000,
}
```

### Custom (OpenAI-Compatible)
```typescript
{
  name: "Mistral AI",
  providerType: "custom",
  endpointUrl: "https://api.mistral.ai/v1",
  apiKey: "Bearer sk-xyz789...", // Full auth header or just key
  modelId: "mistral-large-latest",
  consentTimestamp: 1728518400000,
}
```

---

## Future Enhancements

1. **Streaming Support**: Support `stream: true` for real-time token generation (requires SSE parsing)
2. **Retry Logic**: Exponential backoff for 429/503 errors (with configurable max retries)
3. **Model Auto-Detection**: Probe `/v1/models` endpoint to populate available models
4. **Custom Headers**: Allow user-defined headers (e.g., `X-API-Version`, `X-Request-ID`)
5. **Proxy Configuration**: Support HTTP/HTTPS proxies for corporate environments

---

## Summary

Three provider types: llama.cpp (local, no auth, `/v1/completions`), Azure OpenAI (HTTPS, api-key header, `/chat/completions`), Custom (user-defined, OpenAI-compatible). All test prompts use 10s timeout, 100 max tokens, temperature 0.7. Auto-discovery uses 2s timeout on `/health` endpoint for llama.cpp. Errors mapped to user-friendly messages with diagnostic actions. Response text truncated to 500 chars.
