import type { StreamFn } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ModelRegistry } from "./model-registry.ts";
import { mergeProviderAttributionHeaders } from "./provider-attribution.ts";
import type { SettingsManager } from "./settings-manager.ts";

/**
 * Build the stream function shared by the main agent and any sub-agents.
 *
 * Resolves auth from the model registry, applies provider retry/timeout
 * settings, and merges attribution headers before delegating to `streamSimple`.
 * Centralizing this keeps sub-agents byte-for-byte consistent with the main
 * agent's provider behavior.
 */
export function createModelStreamFn(modelRegistry: ModelRegistry, settingsManager: SettingsManager): StreamFn {
	return async (model, context, options) => {
		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			throw new Error(auth.error);
		}
		const env = auth.env || options?.env ? { ...(auth.env ?? {}), ...(options?.env ?? {}) } : undefined;
		const providerRetrySettings = settingsManager.getProviderRetrySettings();
		const httpIdleTimeoutMs = settingsManager.getHttpIdleTimeoutMs();
		// SDKs treat timeout=0 as 0ms (immediate timeout), not "no timeout".
		// Use max int32 to effectively disable the timeout.
		const effectiveTimeoutMs = httpIdleTimeoutMs === 0 ? 2147483647 : httpIdleTimeoutMs;
		const timeoutMs = options?.timeoutMs ?? providerRetrySettings.timeoutMs ?? effectiveTimeoutMs;
		const websocketConnectTimeoutMs =
			options?.websocketConnectTimeoutMs ?? settingsManager.getWebSocketConnectTimeoutMs();
		return streamSimple(model, context, {
			...options,
			apiKey: auth.apiKey,
			env,
			timeoutMs,
			websocketConnectTimeoutMs,
			maxRetries: options?.maxRetries ?? providerRetrySettings.maxRetries,
			maxRetryDelayMs: options?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
			headers: mergeProviderAttributionHeaders(
				model,
				settingsManager,
				options?.sessionId,
				auth.headers,
				options?.headers,
			),
		});
	};
}
