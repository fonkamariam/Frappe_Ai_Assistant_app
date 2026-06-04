/**
 * ai_chat.js
 * ==========
 * Architecture:
 *
 *   ConversationStorage  — localStorage CRUD, schema, sort. Swap for DocType later.
 *   ChatApiService       — All HTTP, streaming simulation, error handling, retries.
 *   ChatUI               — DOM rendering only. No API calls. No storage calls.
 *   Page controller      — Wires the three layers together. Handles events.
 *
 * Storage schema per conversation:
 *   {
 *     id:           string,
 *     title:        string,
 *     created_at:   ISO string,
 *     last_updated: ISO string,
 *     messages:     Array<{ role, content, reasoning_content?, attachments? }>
 *   }
 */

frappe.pages['ai-chat'].on_page_load = async function (wrapper) {

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    $(page.body).html(frappe.render_template('ai_chat', {}));
    frappe.require('/assets/ai_assistant/css/ai_chat.css');

    // =========================================================================
    // LAYER 1: ConversationStorage
    // Responsible for: localStorage CRUD, schema normalisation, ordering.
    // To migrate to Frappe DocTypes later: replace only this class.
    // =========================================================================
    const ConversationStorage = (() => {
        const STORAGE_KEY = 'ai_chat_conversations_v2';
        const MAX_TITLE   = 30;

        function _load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        function _save(convs) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
            } catch (e) {
                // localStorage quota exceeded — non-fatal
                console.warn('AI Chat: localStorage save failed', e);
            }
        }

        /** Always return conversations sorted by last_updated DESC */
        function getAll() {
            const convs = _load();
            return convs.sort((a, b) =>
                new Date(b.last_updated) - new Date(a.last_updated)
            );
        }

        function getById(id) {
            return _load().find(c => c.id === id) || null;
        }

        function create(overrides = {}) {
            const now = new Date().toISOString();
            const conv = {
                id:           'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title:        'New Chat',
                created_at:   now,
                last_updated: now,
                messages:     [],
                ...overrides
            };
            const convs = _load();
            convs.unshift(conv);
            _save(convs);
            return conv;
        }

        function save(conv) {
            const convs = _load();
            const idx = convs.findIndex(c => c.id === conv.id);
            if (idx >= 0) {
                convs[idx] = conv;
            } else {
                convs.unshift(conv);
            }
            _save(convs);
        }

        function deleteById(id) {
            const convs = _load().filter(c => c.id !== id);
            _save(convs);
        }

        function rename(id, newTitle) {
            const convs = _load();
            const conv = convs.find(c => c.id === id);
            if (conv) {
                conv.title = newTitle.trim().substring(0, 80) || conv.title;
                _save(convs);
                return conv;
            }
            return null;
        }

        /**
         * Touch last_updated on a conversation so it floats to the top.
         * Call this whenever a user or assistant message is added.
         */
        function touch(id) {
            const convs = _load();
            const conv = convs.find(c => c.id === id);
            if (conv) {
                conv.last_updated = new Date().toISOString();
                _save(convs);
            }
        }

        function addMessage(convId, message) {
            const convs = _load();
            const conv = convs.find(c => c.id === convId);
            if (!conv) return null;
            if (!Array.isArray(conv.messages)) conv.messages = [];
            conv.messages.push(message);
            conv.last_updated = new Date().toISOString();
            _save(convs);
            return conv;
        }

        function autoTitle(text, maxLen = MAX_TITLE) {
            const clean = text.trim().replace(/\s+/g, ' ');
            return clean.length > maxLen ? clean.substring(0, maxLen) + '…' : clean;
        }

        return { getAll, getById, create, save, deleteById, rename, touch, addMessage, autoTitle };
    })();


    // =========================================================================
    // DRAFT STORAGE — Manages draft messages per conversation
    // =========================================================================
    const DraftStorage = (() => {
        const DRAFT_STORAGE_KEY = 'ai_chat_drafts_v1';

        function _load() {
            try {
                const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
                if (!raw) return {};
                const parsed = JSON.parse(raw);
                return typeof parsed === 'object' ? parsed : {};
            } catch {
                return {};
            }
        }

        function _save(drafts) {
            try {
                localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
            } catch (e) {
                console.warn('AI Chat: Draft storage save failed', e);
            }
        }

        function getDraft(convId) {
            const drafts = _load();
            return drafts[convId] || '';
        }

        function saveDraft(convId, text) {
            const drafts = _load();
            if (text.trim()) {
                drafts[convId] = text;
            } else {
                delete drafts[convId];
            }
            _save(drafts);
        }

        function clearDraft(convId) {
            const drafts = _load();
            delete drafts[convId];
            _save(drafts);
        }

        return { getDraft, saveDraft, clearDraft };
    })();


    // =========================================================================
    // FRONTEND SETTINGS
    // Responsible for: browser-local demo config for LLM providers and MCP access.
    // =========================================================================
    const FrontendSettings = (() => {
        const STORAGE_KEY = 'ai_chat_frontend_settings_v1';
        const DEFAULTS = {
            llm_provider: 'openai',
            openai_api_key: '',
            openai_model: 'gpt-5.5',
            openai_base_url: 'https://api.openai.com/v1',
            google_api_key: '',
            google_model: 'gemini-2.5-flash',
            google_base_url: 'https://generativelanguage.googleapis.com/v1beta',
            mcp_server_label: 'erpnext',
            mcp_server_description: 'ERPNext MCP server for business data and actions.',
            mcp_server_url: new URL(
                '/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp',
                window.location.origin
            ).toString(),
        };

        function _load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return { ...DEFAULTS };
                const parsed = JSON.parse(raw);
                return { ...DEFAULTS, ...(parsed || {}) };
            } catch {
                return { ...DEFAULTS };
            }
        }

        function get() {
            return _load();
        }

        function save(values = {}) {
            const next = { ..._load(), ...(values || {}) };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        }

        return { get, save, DEFAULTS };
    })();


    // =========================================================================
    // FRONTEND OAUTH SERVICE
    // Responsible for: browser-only OAuth discovery, PKCE, token exchange,
    // refresh, and connection state for the ERPNext MCP endpoint.
    // =========================================================================
    const OAuthService = (() => {
        const TOKEN_STORAGE_KEY = 'ai_chat_mcp_oauth_tokens_v1';
        const PENDING_STORAGE_KEY = 'ai_chat_mcp_oauth_pending_v1';
        const EXPIRY_SKEW_MS = 60 * 1000;

        function _loadFrom(storage, key, fallback = null) {
            try {
                const raw = storage.getItem(key);
                if (!raw) return fallback;
                return JSON.parse(raw);
            } catch {
                return fallback;
            }
        }

        function _saveTo(storage, key, value) {
            storage.setItem(key, JSON.stringify(value));
        }

        function _removeFrom(storage, key) {
            storage.removeItem(key);
        }

        function _base64Url(bytes) {
            const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        }

        function _randomString(byteLength = 32) {
            const bytes = new Uint8Array(byteLength);
            crypto.getRandomValues(bytes);
            return _base64Url(bytes);
        }

        async function _sha256Base64Url(text) {
            const encoded = new TextEncoder().encode(text);
            const digest = await crypto.subtle.digest('SHA-256', encoded);
            return _base64Url(new Uint8Array(digest));
        }

        function _getRedirectUri() {
            const url = new URL(window.location.href);
            url.search = '';
            return url.toString();
        }

        function _cleanupCallbackUrl() {
            const url = new URL(window.location.href);
            url.search = '';
            window.history.replaceState({}, document.title, url.toString());
        }

        function _getProtectedResourceMetadataUrl(resourceUrl) {
            const resource = new URL(resourceUrl);
            return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
        }

        async function _fetchJson(url, options = {}) {
            const resolvedUrl = new URL(url, window.location.origin);
            const method = (options.method || 'GET').toUpperCase();
            const isSameOrigin = resolvedUrl.origin === window.location.origin;
            const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(method);
            const headers = {
                Accept: 'application/json',
                ...(options.headers || {}),
            };

            if (isSameOrigin && isWriteRequest && frappe?.csrf_token && !headers['X-Frappe-CSRF-Token']) {
                headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
            }

            if (isSameOrigin && isWriteRequest && !headers['X-Requested-With']) {
                headers['X-Requested-With'] = 'XMLHttpRequest';
            }

            const response = await fetch(url, {
                ...options,
                credentials: options.credentials || 'same-origin',
                headers,
            });

            const text = await response.text();
            let data = {};

            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { raw: text };
            }

            if (!response.ok) {
                throw new Error(
                    data.error_description
                    || data.message
                    || data.error
                    || `Request failed (${response.status})`
                );
            }

            return data;
        }

        async function discover(resourceUrl) {
            const resourceMetadata = await _fetchJson(
                _getProtectedResourceMetadataUrl(resourceUrl),
                {
                    headers: {
                        'MCP-Protocol-Version': '2025-11-25',
                    },
                }
            );

            const authorizationServer = (resourceMetadata.authorization_servers || [])[0]
                || resourceMetadata.resource
                || new URL(resourceUrl).origin;

            const authMetadata = await _fetchJson(
                new URL('/.well-known/oauth-authorization-server', authorizationServer).toString()
            );

            return { resourceMetadata, authMetadata, authorizationServer };
        }

        async function registerClient(authMetadata, redirectUri) {
            if (!authMetadata.registration_endpoint) {
                throw new Error('The authorization server does not expose dynamic client registration.');
            }

            return _fetchJson(authMetadata.registration_endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_name: 'Frappe AI Assistant',
                    client_uri: window.location.origin,
                    redirect_uris: [redirectUri],
                    grant_types: ['authorization_code', 'refresh_token'],
                    response_types: ['code'],
                    token_endpoint_auth_method: 'none',
                }),
            });
        }

        function getStoredTokens() {
            return _loadFrom(localStorage, TOKEN_STORAGE_KEY, null);
        }

        function clearTokens() {
            _removeFrom(localStorage, TOKEN_STORAGE_KEY);
        }

        function getStatus() {
            const tokens = getStoredTokens();
            if (!tokens || !tokens.access_token) {
                return {
                    connected: false,
                    className: 'disconnected',
                    label: 'MCP disconnected',
                };
            }

            const remainingMs = (tokens.expires_at || 0) - Date.now();
            if (remainingMs <= 0) {
                return {
                    connected: false,
                    className: 'disconnected',
                    label: 'MCP token expired',
                };
            }

            if (remainingMs <= 5 * 60 * 1000) {
                return {
                    connected: true,
                    className: 'expiring',
                    label: 'MCP expiring soon',
                };
            }

            return {
                connected: true,
                className: 'connected',
                label: 'MCP connected',
            };
        }

        async function beginAuthorization(settings) {
            if (!settings.mcp_server_url) {
                throw new Error('Set the MCP server URL before connecting.');
            }

            const redirectUri = _getRedirectUri();
            const discovery = await discover(settings.mcp_server_url);
            const client = await registerClient(discovery.authMetadata, redirectUri);
            const state = _randomString(18);
            const codeVerifier = _randomString(48);
            const codeChallenge = await _sha256Base64Url(codeVerifier);

            _saveTo(sessionStorage, PENDING_STORAGE_KEY, {
                state,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                resource: settings.mcp_server_url,
                token_endpoint: discovery.authMetadata.token_endpoint,
                authorization_endpoint: discovery.authMetadata.authorization_endpoint,
                client_id: client.client_id,
                client_secret: client.client_secret || '',
            });

            const authUrl = new URL(discovery.authMetadata.authorization_endpoint);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', client.client_id);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('resource', settings.mcp_server_url);

            window.location.assign(authUrl.toString());
        }

        async function completeAuthorizationIfPresent() {
            const url = new URL(window.location.href);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');

            if (!code && !error) {
                return { handled: false };
            }

            if (error) {
                const description = url.searchParams.get('error_description');
                _cleanupCallbackUrl();
                throw new Error(description || `OAuth error: ${error}`);
            }

            const pending = _loadFrom(sessionStorage, PENDING_STORAGE_KEY, null);
            if (!pending || pending.state !== state) {
                _cleanupCallbackUrl();
                throw new Error('OAuth callback state mismatch. Please reconnect the MCP server.');
            }

            const form = new URLSearchParams();
            form.set('grant_type', 'authorization_code');
            form.set('code', code);
            form.set('redirect_uri', pending.redirect_uri);
            form.set('client_id', pending.client_id);
            if (pending.client_secret) {
                form.set('client_secret', pending.client_secret);
            }
            form.set('code_verifier', pending.code_verifier);
            form.set('resource', pending.resource);

            const tokenData = await _fetchJson(pending.token_endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            });

            const now = Date.now();
            _saveTo(localStorage, TOKEN_STORAGE_KEY, {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || '',
                token_type: tokenData.token_type || 'Bearer',
                scope: tokenData.scope || '',
                obtained_at: now,
                expires_in: Number(tokenData.expires_in || 3600),
                expires_at: now + (Number(tokenData.expires_in || 3600) * 1000),
                resource: pending.resource,
                token_endpoint: pending.token_endpoint,
                client_id: pending.client_id,
                client_secret: pending.client_secret || '',
            });

            _removeFrom(sessionStorage, PENDING_STORAGE_KEY);
            _cleanupCallbackUrl();

            return { handled: true };
        }

        async function refreshAccessTokenIfNeeded() {
            const tokens = getStoredTokens();
            if (!tokens || !tokens.access_token) {
                throw new Error('Connect the ERPNext MCP server before sending a message.');
            }

            if ((tokens.expires_at || 0) - Date.now() > EXPIRY_SKEW_MS) {
                return tokens;
            }

            if (!tokens.refresh_token) {
                clearTokens();
                throw new Error('The MCP access token expired. Please reconnect.');
            }

            const form = new URLSearchParams();
            form.set('grant_type', 'refresh_token');
            form.set('refresh_token', tokens.refresh_token);
            form.set('client_id', tokens.client_id);
            if (tokens.client_secret) {
                form.set('client_secret', tokens.client_secret);
            }
            if (tokens.resource) {
                form.set('resource', tokens.resource);
            }

            const tokenData = await _fetchJson(tokens.token_endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            });

            const now = Date.now();
            const next = {
                ...tokens,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || tokens.refresh_token,
                token_type: tokenData.token_type || tokens.token_type || 'Bearer',
                scope: tokenData.scope || tokens.scope || '',
                obtained_at: now,
                expires_in: Number(tokenData.expires_in || 3600),
                expires_at: now + (Number(tokenData.expires_in || 3600) * 1000),
            };

            _saveTo(localStorage, TOKEN_STORAGE_KEY, next);
            return next;
        }

        async function getAccessToken() {
            const tokens = await refreshAccessTokenIfNeeded();
            return tokens.access_token;
        }

        return {
            beginAuthorization,
            clearTokens,
            completeAuthorizationIfPresent,
            getAccessToken,
            getStatus,
            getStoredTokens,
            refreshAccessTokenIfNeeded,
        };
    })();


    // =========================================================================
    // LAYER 2: ChatApiService
    // Responsible for: direct browser calls to the selected LLM provider using
    // the stored provider key and ERPNext MCP OAuth bearer token.
    // =========================================================================
    const ChatApiService = (() => {
        let _abortController = null;

        const ERROR_MESSAGES = {
            MISSING_OPENAI_KEY: 'Add your OpenAI API key in Settings before sending a message.',
            MISSING_GOOGLE_KEY: 'Add your Google AI API key in Settings before sending a message.',
            MCP_NOT_CONNECTED: 'Connect the ERPNext MCP server before sending a message.',
            INVALID_OPENAI_KEY: 'The OpenAI API key was rejected. Update it in Settings and try again.',
            INVALID_GOOGLE_KEY: 'The Google AI API key was rejected. Update it in Settings and try again.',
            RATE_LIMITED: 'The model provider rate limited this request. Please wait a moment and try again.',
            REQUEST_TIMEOUT: 'The request timed out. Please try again.',
            NETWORK_ERROR: 'Network error. Please check your connection and try again.',
            EMPTY_RESPONSE: 'The model returned an empty response. Please try rephrasing.',
            MALFORMED_RESPONSE: 'Received an unexpected response from the model provider.',
            UPSTREAM_ERROR: 'The model provider returned an error for this request.',
            UNKNOWN: 'An unexpected error occurred. Please try again.',
        };

        const SYSTEM_PROMPT = [
            'You are a helpful AI assistant embedded inside ERPNext.',
            'When a user asks about ERPNext data or wants to perform ERPNext actions, use the connected MCP server instead of guessing.',
            'If the MCP server does not provide enough information, explain that clearly rather than inventing data.',
            'For general non-ERP questions, answer normally and concisely.',
        ].join(' ');

        function _getResponsesUrl(baseUrl) {
            return `${(baseUrl || FrontendSettings.DEFAULTS.openai_base_url).replace(/\/+$/, '')}/responses`;
        }

        function _getGoogleInteractionsUrl(baseUrl) {
            return `${(baseUrl || FrontendSettings.DEFAULTS.google_base_url).replace(/\/+$/, '')}/interactions`;
        }

        function _buildInput(history, latestMessage) {
            const input = [];
            for (const item of history || []) {
                if (!item || !['user', 'assistant'].includes(item.role)) continue;
                if (typeof item.content !== 'string' || !item.content.trim()) continue;
                input.push({
                    role: item.role,
                    content: item.content.trim(),
                });
            }

            input.push({
                role: 'user',
                content: latestMessage.trim(),
            });

            return input;
        }

        function _extractOutputText(payload) {
            if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
                return payload.output_text.trim();
            }

            const chunks = [];
            for (const item of payload.output || []) {
                if (item.type !== 'message' || !Array.isArray(item.content)) continue;
                for (const part of item.content) {
                    if (part.type === 'output_text' && part.text) {
                        chunks.push(part.text);
                    }
                }
            }

            return chunks.join('\n').trim();
        }

        function _didUseMcp(payload) {
            try {
                return /"type":"[^"]*mcp/i.test(JSON.stringify(payload.output || []));
            } catch {
                return false;
            }
        }

        function _extractGoogleOutputText(payload) {
            if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
                return payload.output_text.trim();
            }

            const chunks = [];
            for (const step of payload.steps || []) {
                if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
                for (const part of step.content) {
                    if (part.type === 'text' && part.text) {
                        chunks.push(part.text);
                    }
                }
            }
            return chunks.join('\n').trim();
        }

        function _didGoogleUseMcp(payload) {
            return (payload.steps || []).some(step =>
                step.type === 'mcp_server_tool_call' || step.type === 'mcp_server_tool_result'
            );
        }

        function _getProvider(settings) {
            return (settings.llm_provider || FrontendSettings.DEFAULTS.llm_provider || 'openai').toLowerCase();
        }

        function _sanitizeMcpServerName(label) {
            const base = String(label || 'erpnext')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_')
                .replace(/^_+|_+$/g, '');
            return base || 'erpnext';
        }

        async function _sendOpenAIMessage(settings, message, history, mcpAccessToken) {
            if (!settings.openai_api_key || !settings.openai_api_key.trim()) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.MISSING_OPENAI_KEY),
                    { code: 'MISSING_OPENAI_KEY' }
                );
            }

            const payload = {
                model: settings.openai_model || FrontendSettings.DEFAULTS.openai_model,
                instructions: SYSTEM_PROMPT,
                input: _buildInput(history, message),
                tools: [
                    {
                        type: 'mcp',
                        server_label: settings.mcp_server_label || FrontendSettings.DEFAULTS.mcp_server_label,
                        server_description: settings.mcp_server_description || FrontendSettings.DEFAULTS.mcp_server_description,
                        server_url: settings.mcp_server_url || FrontendSettings.DEFAULTS.mcp_server_url,
                        authorization: mcpAccessToken,
                        require_approval: 'never',
                    },
                ],
                store: false,
            };

            let response;
            try {
                response = await fetch(_getResponsesUrl(settings.openai_base_url), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${settings.openai_api_key.trim()}`,
                    },
                    body: JSON.stringify(payload),
                    signal: _abortController.signal,
                });
            } catch (err) {
                if (err.name === 'AbortError') {
                    throw Object.assign(new Error('Request cancelled.'), { code: 'CANCELLED' });
                }
                throw Object.assign(
                    new Error(ERROR_MESSAGES.NETWORK_ERROR),
                    { code: 'NETWORK_ERROR' }
                );
            }

            let data;
            try {
                data = await response.json();
            } catch {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.MALFORMED_RESPONSE),
                    { code: 'MALFORMED_RESPONSE' }
                );
            }

            if (!response.ok) {
                let code = 'UNKNOWN';
                if (response.status === 401) code = 'INVALID_OPENAI_KEY';
                else if (response.status === 429) code = 'RATE_LIMITED';
                else if (response.status >= 500) code = 'UPSTREAM_ERROR';

                const messageText = data?.error?.message
                    || ERROR_MESSAGES[code]
                    || ERROR_MESSAGES.UNKNOWN;

                throw Object.assign(new Error(messageText), { code });
            }

            const content = _extractOutputText(data);
            if (!content) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.EMPTY_RESPONSE),
                    { code: 'EMPTY_RESPONSE' }
                );
            }

            return {
                content,
                reasoning_content: '',
                model: data.model || settings.openai_model || '',
                usage: data.usage || {},
                data_source: _didUseMcp(data) ? 'ERPNext' : 'Model',
            };
        }

        async function _sendGoogleMessage(settings, message, history, mcpAccessToken) {
            if (!settings.google_api_key || !settings.google_api_key.trim()) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.MISSING_GOOGLE_KEY),
                    { code: 'MISSING_GOOGLE_KEY' }
                );
            }

            const payload = {
                model: settings.google_model || FrontendSettings.DEFAULTS.google_model,
                input: _buildInput(history, message).map(item => ({
                    role: item.role,
                    content: [{ type: 'text', text: item.content }],
                })),
                store: false,
                system_instruction: SYSTEM_PROMPT,
                tools: [
                    {
                        type: 'mcp_server',
                        name: _sanitizeMcpServerName(
                            settings.mcp_server_label || FrontendSettings.DEFAULTS.mcp_server_label
                        ),
                        url: settings.mcp_server_url || FrontendSettings.DEFAULTS.mcp_server_url,
                        headers: {
                            Authorization: `Bearer ${mcpAccessToken}`,
                        },
                    },
                ],
            };

            let response;
            try {
                response = await fetch(_getGoogleInteractionsUrl(settings.google_base_url), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': settings.google_api_key.trim(),
                    },
                    body: JSON.stringify(payload),
                    signal: _abortController.signal,
                });
            } catch (err) {
                if (err.name === 'AbortError') {
                    throw Object.assign(new Error('Request cancelled.'), { code: 'CANCELLED' });
                }
                throw Object.assign(
                    new Error(ERROR_MESSAGES.NETWORK_ERROR),
                    { code: 'NETWORK_ERROR' }
                );
            }

            let data;
            try {
                data = await response.json();
            } catch {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.MALFORMED_RESPONSE),
                    { code: 'MALFORMED_RESPONSE' }
                );
            }

            if (!response.ok) {
                let code = 'UNKNOWN';
                if (response.status === 400) code = 'UPSTREAM_ERROR';
                else if (response.status === 401 || response.status === 403) code = 'INVALID_GOOGLE_KEY';
                else if (response.status === 429) code = 'RATE_LIMITED';
                else if (response.status >= 500) code = 'UPSTREAM_ERROR';

                const messageText = data?.error?.message
                    || data?.message
                    || ERROR_MESSAGES[code]
                    || ERROR_MESSAGES.UNKNOWN;

                throw Object.assign(new Error(messageText), { code });
            }

            const content = _extractGoogleOutputText(data);
            if (!content) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.EMPTY_RESPONSE),
                    { code: 'EMPTY_RESPONSE' }
                );
            }

            return {
                content,
                reasoning_content: '',
                model: data.model || settings.google_model || '',
                usage: data.usage || {},
                data_source: _didGoogleUseMcp(data) ? 'ERPNext' : 'Model',
            };
        }

        async function sendMessage(message, history = []) {
            cancel();
            _abortController = new AbortController();

            const settings = FrontendSettings.get();
            const provider = _getProvider(settings);

            let mcpAccessToken;
            try {
                mcpAccessToken = await OAuthService.getAccessToken();
            } catch (err) {
                throw Object.assign(
                    new Error(err.message || ERROR_MESSAGES.MCP_NOT_CONNECTED),
                    { code: 'MCP_NOT_CONNECTED' }
                );
            }

            try {
                if (provider === 'google') {
                    return await _sendGoogleMessage(settings, message, history, mcpAccessToken);
                }
                return await _sendOpenAIMessage(settings, message, history, mcpAccessToken);
            } finally {
                _abortController = null;
            }
        }

        /**
         * Cancel the current in-flight request.
         */
        function cancel() {
            if (_abortController) {
                _abortController.abort();
                _abortController = null;
            }
        }

        function isActive() {
            return _abortController !== null;
        }

        /**
         * Simulate streaming: call onChunk(char) for each character
         * with a small random delay, then resolve.
         * This gives the DeepSeek typewriter feel on top of a batch response.
         *
         * @param {string}   text       - full text to stream
         * @param {Function} onChunk    - called with each incremental string
         * @param {Function} isCancelled- checked before each chunk; if true, stops
         * @param {number}   speed      - base ms per chunk (adaptive)
         */
        async function simulateStream(text, onChunk, isCancelled, speed = 8) {
            if (!text) return;

            // Adaptive chunk size: larger for long texts to keep it snappy
            const chunkSize = text.length > 1000 ? 4 : text.length > 400 ? 2 : 1;

            for (let i = 0; i < text.length; i += chunkSize) {
                if (isCancelled()) return;
                onChunk(text.slice(i, i + chunkSize));
                // Very short delay — feels like real streaming
                if (i % 12 === 0) {
                    await new Promise(r => setTimeout(r, speed + Math.random() * 6));
                }
            }
        }

        /**
         * Upload a file to Frappe and return { file_name, file_url }.
         */
        async function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('is_private', 1);

            const response = await fetch('/api/method/upload_file', {
                method:  'POST',
                headers: { 'X-Frappe-CSRF-Token': frappe.csrf_token },
                body:    formData,
            });

            if (!response.ok) {
                throw new Error(`Upload failed (HTTP ${response.status})`);
            }

            const data = await response.json();
            const msg  = data.message;
            if (!msg || !msg.file_url) throw new Error('Upload response missing file_url');
            return { file_name: msg.file_name || file.name, file_url: msg.file_url };
        }

        return { sendMessage, cancel, isActive, simulateStream, uploadFile };
    })();


    // =========================================================================
    // LAYER 3: ChatUI
    // Responsible for: DOM rendering only.
    // No direct API calls. No localStorage calls.
    // Calls back to the controller via passed-in functions.
    // =========================================================================
    const ChatUI = (() => {
        const MAX_TITLE_DISPLAY = 30;

        // ------ Markdown renderer ------
        function renderMarkdown(text) {
            if (!text) return '';

            function escHtml(str) {
                return str
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            const codeBlocks = [];

            // 1. Extract fenced code blocks and replace with HTML immediately
            let result = text.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, (_, lang, code) => {
                const escaped   = escHtml(code.trimEnd());
                const langLabel = lang || 'code';
                const html = `
                    <div class="code-block-wrap">
                        <div class="code-block-header">
                            <span class="code-lang">${escHtml(langLabel)}</span>
                            <button class="copy-code-btn" data-code="${escaped.replace(/"/g, '&quot;')}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg> Copy
                            </button>
                        </div>
                        <pre>${escaped}</pre>
                    </div>`;
                return html;
            });

            // 2. Inline code
            result = result.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);

            // 3. Bold / italic
            result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
            result = result.replace(/_(.+?)_/g, '<em>$1</em>');

            // 4. Headings and lists and paragraphs
            const lines  = result.split('\n');
            const output = [];
            let inOl = false, inUl = false;

            for (const line of lines) {
                // Handle headings
                const h1Match = line.match(/^#\s+(.+)/);
                if (h1Match) {
                    if (inOl) { output.push('</ol>'); inOl = false; }
                    if (inUl) { output.push('</ul>'); inUl = false; }
                    output.push(`<h1>${h1Match[1]}</h1>`);
                    continue;
                }

                const h2Match = line.match(/^##\s+(.+)/);
                if (h2Match) {
                    if (inOl) { output.push('</ol>'); inOl = false; }
                    if (inUl) { output.push('</ul>'); inUl = false; }
                    output.push(`<h2>${h2Match[1]}</h2>`);
                    continue;
                }

                const h3Match = line.match(/^###\s+(.+)/);
                if (h3Match) {
                    if (inOl) { output.push('</ol>'); inOl = false; }
                    if (inUl) { output.push('</ul>'); inUl = false; }
                    output.push(`<h3>${h3Match[1]}</h3>`);
                    continue;
                }

                const h4Match = line.match(/^####\s+(.+)/);
                if (h4Match) {
                    if (inOl) { output.push('</ol>'); inOl = false; }
                    if (inUl) { output.push('</ul>'); inUl = false; }
                    output.push(`<h4>${h4Match[1]}</h4>`);
                    continue;
                }

                // Handle ordered lists
                const olMatch = line.match(/^(\d+)\.\s+(.+)/);
                if (olMatch) {
                    if (!inOl) { output.push('<ol>'); inOl = true; }
                    output.push(`<li>${olMatch[2]}</li>`);
                    continue;
                } else if (inOl) { output.push('</ol>'); inOl = false; }

                // Handle unordered lists
                const ulMatch = line.match(/^[-*]\s+(.+)/);
                if (ulMatch) {
                    if (!inUl) { output.push('<ul>'); inUl = true; }
                    output.push(`<li>${ulMatch[1]}</li>`);
                    continue;
                } else if (inUl) { output.push('</ul>'); inUl = false; }

                if (line.trim() === '') { output.push(''); continue; }

                // Do NOT wrap a line that is already an HTML block (code block)
                // Since code blocks are already inserted as raw HTML, they won't be caught here.
                output.push(`<p>${line}</p>`);
            }

            if (inOl) output.push('</ol>');
            if (inUl) output.push('</ul>');

            result = output.join('');

            // 5. Clean up empty <p> tags (optional)
            result = result.replace(/<p>\s*<\/p>/g, '');

            return result;
}
    
        // ------ Sidebar ------
        function renderConversationList(conversations, currentId, callbacks) {
            const container = $('#conversation-list');
            const filter    = ($('#search-input').val() || '').toLowerCase();
            container.empty();

            let visible = conversations.filter(c => c.messages && c.messages.length > 0);
            if (filter) {
                visible = visible.filter(c => c.title.toLowerCase().includes(filter));
            }

            if (visible.length === 0) {
                container.append('<div class="conv-empty-msg">No conversations found.</div>');
                return;
            }

            const today     = moment().startOf('day');
            const yesterday = moment().subtract(1, 'days').startOf('day');
            const weekAgo   = moment().subtract(7, 'days').startOf('day');
            const monthAgo  = moment().subtract(30, 'days').startOf('day');

            const groups = {
                'Today':           [],
                'Yesterday':       [],
                'Previous 7 Days': [],
                'Previous 30 Days':[],
                'Older':           []
            };

            visible.forEach(c => {
                const m = moment(c.last_updated || c.created_at);
                if      (m.isSameOrAfter(today))     groups['Today'].push(c);
                else if (m.isSameOrAfter(yesterday))  groups['Yesterday'].push(c);
                else if (m.isSameOrAfter(weekAgo))    groups['Previous 7 Days'].push(c);
                else if (m.isSameOrAfter(monthAgo))   groups['Previous 30 Days'].push(c);
                else                                  groups['Older'].push(c);
            });

            Object.entries(groups).forEach(([label, items]) => {
                if (!items.length) return;
                const groupEl = $(`<div class="date-group"><div class="date-label">${label}</div></div>`);
                items.forEach(conv => {
                    const displayTitle = conv.title.length > MAX_TITLE_DISPLAY
                        ? conv.title.substring(0, MAX_TITLE_DISPLAY) + '…'
                        : conv.title;

                    const item = $(`
                        <div class="conversation-item${conv.id === currentId ? ' active' : ''}"
                             data-id="${conv.id}">
                            <span class="title">${displayTitle}</span>
                            <button class="more-btn" title="More options">⋯</button>
                            <div class="dropdown-menu">
                                <div class="dropdown-item rename-action">Rename</div>
                                <div class="dropdown-item danger delete-action">Delete</div>
                            </div>
                        </div>`);

                    item.on('click', e => {
                        if ($(e.target).closest('.more-btn, .dropdown-menu, .title input').length) return;
                        closeDropdowns();
                        callbacks.onSelect(conv.id);
                    });
                    item.find('.more-btn').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        item.find('.dropdown-menu').toggleClass('show');
                    });
                    item.find('.rename-action').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        _startInlineRename(item, conv, callbacks.onRename);
                    });
                    item.find('.delete-action').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        callbacks.onDelete(conv.id);
                    });

                    groupEl.append(item);
                });
                container.append(groupEl);
            });
        }

        function _startInlineRename(item, conv, onRename) {
            const titleSpan    = item.find('.title');
            const currentTitle = conv.title;
            const input        = $(`<input type="text" value="${currentTitle}" />`);
            titleSpan.html(input);
            input.focus().select();

            const save = () => {
                const newTitle = input.val().trim();
                if (newTitle && newTitle !== currentTitle) {
                    onRename(conv.id, newTitle);
                } else {
                    const disp = currentTitle.length > 30
                        ? currentTitle.substring(0, 30) + '…'
                        : currentTitle;
                    titleSpan.text(disp);
                }
            };

            input.on('blur', save);
            input.on('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); input.trigger('blur'); }
                if (e.key === 'Escape') { titleSpan.text(currentTitle); }
            });
        }

        function closeDropdowns() {
            $('.dropdown-menu.show').removeClass('show');
        }

        function updateChatHeader(title) {
            $('#chat-title').text(title || 'AI Assistant');
        }

        // ------ Message rendering ------

        /**
         * Append a completed message bubble to the chat.
         */
        function appendMessage(role, content, opts = {}) {
            const { attachments = [], reasoning_content = '', messageId = null, error = null, messageIndex = null, convId = null, data_source = null } = opts;
            const chatBox    = $('#chat-messages');
            const isUser     = role === 'user';
            const authorLabel= isUser ? 'You' : 'AI Assistant';
            const avatarHtml = isUser
                ? `<div class="msg-avatar avatar-user">U</div>`
                : `<div class="msg-avatar avatar-bot">✦</div>`;

            let bubbleContent = '';

            // Data source badge (only for assistant messages with tools)
            let dataSourceBadge = '';
            if (!isUser && data_source && data_source !== 'Model') {
                dataSourceBadge = `<div class="data-source-badge" title="Data fetched from ${data_source}">📊 ${data_source}</div>`;
            }

            // Reasoning block (DeepSeek R1)
            if (!isUser && reasoning_content) {
                bubbleContent += _buildReasoningBlock(reasoning_content);
            }

            // Attachments
            if (attachments.length > 0) {
                bubbleContent += _buildAttachmentsHtml(attachments);
            }

            // Main text (show even if there's an error)
            if (content) {
                bubbleContent += renderMarkdown(content);
            }

            // Error state for user messages (appears after the message content)
            if (error && isUser) {
                // Check if it's an interrupted state
                const isInterrupted = error.isInterrupted === true;
                const errorClass = isInterrupted ? 'msg-error msg-interrupted' : 'msg-error';
                const errorIcon = isInterrupted 
                    ? '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
                    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
                
                bubbleContent += `
                    <div class="${errorClass}">
                        <div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                ${errorIcon}
                            </svg>
                            ${error.message}
                        </div>
                        <button class="retry-btn" data-msg-index="${messageIndex}" data-conv-id="${convId}">Try again</button>
                    </div>`;
            }

            const idAttr = messageId ? `id="${messageId}"` : '';
            const msgHtml = `
                <div class="message ${role}" ${idAttr}>
                    ${avatarHtml}
                    <div class="msg-body">
                        <span class="msg-author">${authorLabel}</span>
                        <div class="bubble">
                            ${bubbleContent}
                            ${dataSourceBadge}
                            ${role === 'assistant' ? `<button class="copy-msg-btn" title="Copy message" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
                        </div>
                    </div>
                </div>`;

            chatBox.append(msgHtml);
            
            // Bind error retry and delete buttons for persisted errors
            if (error && isUser && messageIndex !== null && convId !== null) {
                setTimeout(() => {
                    const retryBtn = chatBox.find(`button.retry-btn[data-msg-index="${messageIndex}"][data-conv-id="${convId}"]`);
                    
                    retryBtn.on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const msgIdx = parseInt($(this).attr('data-msg-index'));
                        const cId = $(this).attr('data-conv-id');
                        retryFailedMessage(cId, msgIdx);
                    });
                }, 0);
            }
            
            _bindBubbleEvents(chatBox);
            scrollToBottom();
        }

        /**
         * Create a streaming placeholder message and return control handles.
         * The caller feeds content into it incrementally.
         */
        function createStreamingMessage() {
            const msgId     = 'stream_msg_' + Date.now();
            const chatBox   = $('#chat-messages');

            chatBox.append(`
                <div class="message assistant" id="${msgId}">
                    <div class="msg-avatar avatar-bot">✦</div>
                    <div class="msg-body">
                        <span class="msg-author">AI Assistant</span>
                        <div class="bubble">
                            <div class="reasoning-block reasoning-thinking" id="${msgId}_reasoning" style="display:none">
                                <button class="reasoning-toggle" type="button">
                                    <span class="reasoning-toggle-icon">▶</span>
                                    <span class="reasoning-label">Thinking…</span>
                                </button>
                                <div class="reasoning-content" id="${msgId}_reasoning_content" style="white-space: pre-wrap; word-break: break-word;"></div>
                            </div>
                            <div class="stream-content" id="${msgId}_content"></div>
                            <span class="stream-cursor" id="${msgId}_cursor">▋</span>
                            <button class="copy-msg-btn" title="Copy message" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                        </div>
                    </div>
                </div>`);

            scrollToBottom();

            return {
                /**
                 * Append reasoning text incrementally.
                 * Shows the reasoning block on first call.
                 */
                appendReasoning(text) {
                    const block = $(`#${msgId}_reasoning`);
                    if (!block.is(':visible')) {
                        block.show();
                    }
                    const el = $(`#${msgId}_reasoning_content`);
                    el.append(document.createTextNode(text));
                    scrollToBottom();
                },

                /**
                 * Mark reasoning as complete — update label and make toggleable.
                 */
                finishReasoning() {
                    const block = $(`#${msgId}_reasoning`);
                    block.removeClass('reasoning-thinking').addClass('reasoning-done open');
                    block.find('.reasoning-label').text('Thought process');
                    block.find('.reasoning-toggle-icon').text('▼');
                },

                /**
                 * Append main content text incrementally.
                 */
                appendContent(text) {
                    const el = $(`#${msgId}_content`);
                    // Append as raw text, we'll re-render as markdown at the end
                    el.data('raw', (el.data('raw') || '') + text);
                    el.text((el.text() || '') + text);
                    scrollToBottom();
                },

                /**
                 * Finalise the message: render markdown, remove cursor, bind events.
                 */
                finalise(fullContent, fullReasoning) {
                    $(`#${msgId}_cursor`).remove();
                    const contentEl = $(`#${msgId}_content`);
                    contentEl.html(renderMarkdown(fullContent));
                    _bindBubbleEvents($('#chat-messages'));
                },

                /**
                 * Set data source badge after finalise.
                 */
                setDataSource(dataSource) {
                    if (dataSource && dataSource !== 'Model') {
                        const bubble = $(`#${msgId} .bubble`);
                        const badge = `<div class="data-source-badge" title="Data fetched from ${dataSource}">📊 ${dataSource}</div>`;
                        bubble.append(badge);
                    }
                },

                /**
                 * Replace entire message with an error state.
                 */
                showError(errorMessage) {
                    $(`#${msgId}_cursor`).remove();
                    $(`#${msgId}_reasoning`).hide();
                    $(`#${msgId}_content`).html(
                        `<div class="msg-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            ${errorMessage}
                            <button class="retry-btn" id="${msgId}_retry">Try again</button>
                        </div>`
                    );
                },

                id: msgId
            };
        }

        function showThinking() {
            const chatBox = $('#chat-messages');
            chatBox.append(`
                <div class="message assistant thinking-row" id="thinking-indicator">
                    <div class="msg-avatar avatar-bot">✦</div>
                    <div class="msg-body">
                        <div class="thinking-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>`);
            scrollToBottom();
        }

        function removeThinking() {
            $('#thinking-indicator').remove();
        }

        function showEmptyState()  {
            $('#empty-state').show();
            $('#chat-messages, #input-container').hide();
        }

        function showChatState() {
            $('#empty-state').hide();
            $('#chat-messages, #input-container').show();
        }

        function clearMessages() {
            $('#chat-messages').empty();
            $('.start-chatting').remove();
        }

        function showStartChatting() {
            if (!$('.start-chatting').length) {
                $('.ai-chat-main').append('<div class="start-chatting">Start chatting…</div>');
            }
        }

        function setSendState(sending) {
            $('#send-btn').prop('disabled', sending);
            $('#user-message').prop('disabled', sending);
            if (sending) {
                $('#stop-btn').show();
                $('#send-btn').hide();
            } else {
                $('#stop-btn').hide();
                $('#send-btn').show();
            }
        }

        function scrollToBottom() {
            const el = document.getElementById('chat-messages');
            if (el) el.scrollTop = el.scrollHeight;
        }

        function autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 44), 180) + 'px';
        }

        function applyTheme(isDark) {
            $('#ai-chat-wrapper').toggleClass('light-mode', !isDark);
            $('#theme-label').text(isDark ? 'Light Mode' : 'Dark Mode');
        }

        // ------ Attachment preview in input area ------
        function renderAttachmentPreviews(pendingAttachments) {
            const container = $('#attachment-previews');
            container.empty();
            pendingAttachments.forEach(att => {
                const isImage = att.type.startsWith('image/');
                const sizeStr = _formatSize(att.size);
                const item    = $(`
                    <div class="attachment-preview-item" data-id="${att.id}">
                        ${isImage
                            ? `<img class="thumb uploading" src="${URL.createObjectURL(att.file)}" alt="${att.name}">`
                            : `<span class="file-icon">📄</span>`}
                        <div class="file-info">
                            <span class="file-name" title="${att.name}">${_truncateFileName(att.name)}</span>
                            <span class="file-size">${sizeStr}</span>
                        </div>
                        <span class="remove-file" data-id="${att.id}">✕</span>
                    </div>`);
                container.append(item);
            });
        }

        // ------ Private helpers ------
        function _buildReasoningBlock(reasoning) {
            return `
                <div class="reasoning-block reasoning-done">
                    <button class="reasoning-toggle" type="button">
                        <span class="reasoning-toggle-icon">▶</span>
                        <span class="reasoning-label">Thought process</span>
                    </button>
                    <div class="reasoning-content">${escapeHtml(reasoning)}</div>
                </div>`;
        }

        function escapeHtml(str) {
            return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        function _buildAttachmentsHtml(attachments) {
            const items = attachments.map(a => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_url);
                if (isImage) {
                    return `<div class="chat-attachment-preview" data-url="${a.file_url}" data-name="${a.file_name}">
                        <img src="${a.file_url}" alt="${a.file_name}">
                    </div>`;
                }
                const ext = (a.file_name || '').split('.').pop().toUpperCase();
                return `<div class="file-card">
                    <span class="file-card-icon">📄</span>
                    <div class="file-card-info">
                        <span class="file-card-name">${a.file_name}</span>
                        <span class="file-card-size">${ext} file</span>
                    </div>
                </div>`;
            }).join('');
            return `<div class="attachments-grid">${items}</div>`;
        }

        function _bindBubbleEvents(chatBox) {
            // Helper to decode HTML entities
            const decodeHtml = (html) => {
                const txt = document.createElement('textarea');
                txt.innerHTML = html;
                return txt.value;
            };

            // Copy code buttons
            chatBox.find('.copy-code-btn').off('click.ai').on('click.ai', function () {
                let code = $(this).attr('data-code');
                // Decode HTML entities
                code = decodeHtml(code);
                // Remove any remaining HTML tags
                code = code.replace(/<[^>]*>/g, '');
                
                navigator.clipboard.writeText(code).then(() => {
                    const btn = $(this);
                    btn.html(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`);
                    setTimeout(() => btn.html(
                        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
                    ), 2000);
                }).catch(() => frappe.show_alert({ message: 'Copy failed', indicator: 'red' }, 2));
            });

            // Copy message button (hover on bubble) - copy just the text content, not HTML
            chatBox.find('.bubble').off('mouseenter.ai mouseleave.ai').on('mouseenter.ai', function() {
                $(this).find('.copy-msg-btn').show();
            }).on('mouseleave.ai', function() {
                $(this).find('.copy-msg-btn').hide();
            });

            chatBox.find('.copy-msg-btn').off('click.ai').on('click.ai', function (e) {
                e.stopPropagation();
                const bubble = $(this).closest('.bubble');
                // Get text content, excluding code blocks and reasoning
                let text = bubble.clone();
                text.find('.code-block-wrap').remove();
                text.find('.reasoning-block').remove();
                text.find('.copy-msg-btn').remove();
                text = text.text().trim();
                
                navigator.clipboard.writeText(text).then(() => {
                    const btn = $(this);
                    btn.html(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`);
                    setTimeout(() => btn.html(
                        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
                    ), 1500);
                }).catch(() => frappe.show_alert({ message: 'Copy failed', indicator: 'red' }, 2));
            });

            // Reasoning toggles
            chatBox.find('.reasoning-toggle').off('click.ai').on('click.ai', function (e) {
                e.preventDefault();
                const block = $(this).closest('.reasoning-block');
                block.toggleClass('open');
                $(this).find('.reasoning-toggle-icon').text(block.hasClass('open') ? '▼' : '▶');
            });

            // Image lightbox
            chatBox.find('.chat-attachment-preview[data-url]').off('click.ai').on('click.ai', function () {
                _openLightbox($(this).data('url'), $(this).data('name'));
            });
        }

        function _openLightbox(url, name) {
            $('#lightbox-image').attr('src', url).attr('alt', name);
            $('#lightbox-modal').addClass('show');
        }

        function _formatSize(bytes) {
            if (bytes < 1024)    return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        function _truncateFileName(name, max = 20) {
            if (name.length <= max) return name;
            const ext = name.lastIndexOf('.');
            if (ext === -1) return name.substring(0, max - 3) + '…';
            const extension = name.substring(ext);
            return name.substring(0, max - extension.length - 3) + '…' + extension;
        }

        return {
            renderConversationList,
            updateChatHeader,
            appendMessage,
            createStreamingMessage,
            showThinking,
            removeThinking,
            showEmptyState,
            showChatState,
            clearMessages,
            showStartChatting,
            setSendState,
            scrollToBottom,
            autoResize,
            applyTheme,
            renderAttachmentPreviews,
            closeDropdowns,
            renderMarkdown,
        };
    })();


    // =========================================================================
    // PAGE CONTROLLER
    // Wires ConversationStorage + ChatApiService + ChatUI together.
    // Handles all events. Manages page-level state.
    // =========================================================================

    // ---- Page state ----
    let currentConversationId = null;
    let pendingAttachments    = [];
    let isDarkMode            = true;
    let isStreaming           = false;  // true while a request is in flight
    let cancelStreaming        = false; // signal to stop simulation loop
    const MAX_TITLE_LENGTH    = 30;

    // ---- Sidebar callbacks passed to ChatUI ----
    const sidebarCallbacks = {
        onSelect: loadConversation,
        onDelete: deleteConversation,
        onRename: (id, newTitle) => {
            const conv = ConversationStorage.rename(id, newTitle);
            if (conv) {
                refreshSidebar();
                if (id === currentConversationId) ChatUI.updateChatHeader(conv.title);
                frappe.show_alert({ message: 'Conversation renamed', indicator: 'green' }, 2);
            }
        }
    };

    function refreshSidebar() {
        const convs = ConversationStorage.getAll();
        ChatUI.renderConversationList(convs, currentConversationId, sidebarCallbacks);
    }

    function updateUserIdentity() {
        const fullName = frappe.session?.user_fullname || frappe.session?.user || 'User';
        const firstInitial = (fullName || 'U').trim().charAt(0).toUpperCase() || 'U';
        $('.user-name').text(fullName);
        $('.user-avatar').text(firstInitial);
    }

    function updateConnectionBadge() {
        const status = OAuthService.getStatus();
        const badge = $('#mcp-connection-badge');
        badge
            .removeClass('connected expiring disconnected')
            .addClass(status.className)
            .text(status.label);

        $('.user-plan').text(status.label);
        $('#connect-mcp-btn').attr(
            'title',
            status.connected ? 'Reconnect ERPNext MCP' : 'Connect ERPNext MCP'
        );
    }

    function openSettingsDialog() {
        const settings = FrontendSettings.get();

        const dialog = new frappe.ui.Dialog({
            title: 'AI Assistant Settings',
            fields: [
                {
                    fieldtype: 'Select',
                    fieldname: 'llm_provider',
                    label: 'LLM Provider',
                    default: settings.llm_provider || FrontendSettings.DEFAULTS.llm_provider,
                    options: ['openai', 'google'],
                    reqd: 1,
                },
                {
                    fieldtype: 'Password',
                    fieldname: 'openai_api_key',
                    label: 'OpenAI API Key',
                    default: settings.openai_api_key || '',
                    reqd: 0,
                    length: 1024,
                    description: 'Stored in this browser only for the demo.',
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'openai_model',
                    label: 'OpenAI Model',
                    default: settings.openai_model || FrontendSettings.DEFAULTS.openai_model,
                },
                {
                    fieldtype: 'Password',
                    fieldname: 'google_api_key',
                    label: 'Google AI API Key',
                    default: settings.google_api_key || '',
                    reqd: 0,
                    length: 1024,
                    description: 'Stored in this browser only for the demo.',
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'google_model',
                    label: 'Google AI Model',
                    default: settings.google_model || FrontendSettings.DEFAULTS.google_model,
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'mcp_server_url',
                    label: 'MCP Server URL',
                    default: settings.mcp_server_url || FrontendSettings.DEFAULTS.mcp_server_url,
                    reqd: 1,
                    max_length: 1024,
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'mcp_server_label',
                    label: 'MCP Server Label',
                    default: settings.mcp_server_label || FrontendSettings.DEFAULTS.mcp_server_label,
                },
                {
                    fieldtype: 'Small Text',
                    fieldname: 'mcp_server_description',
                    label: 'MCP Server Description',
                    default: settings.mcp_server_description || FrontendSettings.DEFAULTS.mcp_server_description,
                },
                {
                    fieldtype: 'HTML',
                    fieldname: 'connection_status',
                },
            ],
            primary_action_label: 'Save',
            primary_action(values) {
                FrontendSettings.save(values);
                updateConnectionBadge();
                dialog.hide();
                frappe.show_alert({ message: 'Settings saved in this browser.', indicator: 'green' }, 3);
            },
        });

        function renderDialogStatus() {
            const status = OAuthService.getStatus();
            const wrapper = dialog.fields_dict.connection_status.$wrapper;
            const tone = status.className === 'connected'
                ? '#4ade80'
                : status.className === 'expiring'
                    ? '#fbbf24'
                    : '#f87171';

            wrapper.html(`
                <div style="margin-top: 8px; padding: 12px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 10px; background: rgba(15, 23, 42, 0.03);">
                    <div style="font-weight: 600; margin-bottom: 6px; color: ${tone};">${status.label}</div>
                    <div style="font-size: 12px; color: var(--text-muted, #94a3b8); line-height: 1.5;">
                        The ERPNext OAuth access token is stored locally in this browser.
                        Your selected model provider receives that access token on each request through the MCP tool config.
                    </div>
                    <button type="button" class="btn btn-default btn-xs" id="clear-mcp-token-btn" style="margin-top: 10px;">
                        Clear MCP Token
                    </button>
                </div>
            `);

            wrapper.find('#clear-mcp-token-btn').on('click', () => {
                OAuthService.clearTokens();
                updateConnectionBadge();
                renderDialogStatus();
                frappe.show_alert({ message: 'Stored MCP token cleared.', indicator: 'orange' }, 3);
            });
        }

            dialog.show();

            const providerField = dialog.get_field('llm_provider');
            const openAiKeyField = dialog.get_field('openai_api_key').$wrapper;
            const openAiModelField = dialog.get_field('openai_model').$wrapper;
            const googleKeyField = dialog.get_field('google_api_key').$wrapper;
            const googleModelField = dialog.get_field('google_model').$wrapper;

            function refreshProviderFields() {
                const provider = (dialog.get_value('llm_provider') || 'openai').toLowerCase();
                const isGoogle = provider === 'google';
                openAiKeyField.toggle(!isGoogle);
                openAiModelField.toggle(!isGoogle);
                googleKeyField.toggle(isGoogle);
                googleModelField.toggle(isGoogle);
            }

            providerField.$input.on('change', refreshProviderFields);
            refreshProviderFields();
        renderDialogStatus();
        if (typeof dialog.set_secondary_action === 'function') {
            dialog.set_secondary_action(
                OAuthService.getStatus().connected ? 'Reconnect MCP' : 'Connect MCP',
                async () => {
                    const values = dialog.get_values();
                    if (!values) return;
                    FrontendSettings.save(values);
                    updateConnectionBadge();
                    await connectMcp(true);
                }
            );
        }
    }

    async function connectMcp(showAlerts = true) {
        try {
            const settings = FrontendSettings.get();
            if (!settings.mcp_server_url) {
                throw new Error('Add the MCP server URL in Settings before connecting.');
            }

            if (showAlerts) {
                frappe.show_alert({
                    message: 'Redirecting to ERPNext to approve MCP access...',
                    indicator: 'blue',
                }, 5);
            }

            await OAuthService.beginAuthorization(settings);
            return true;
        } catch (err) {
            frappe.show_alert({
                message: err.message || 'Failed to start MCP authentication.',
                indicator: 'red',
            }, 6);
            return false;
        }
    }

    // ---- Conversation management ----
     function loadConversation(id) {
        if (id === currentConversationId) return;
        const conv = ConversationStorage.getById(id);
        if (!conv) return;

        // Save current draft before switching away
        if (currentConversationId) {
            const currentText = $('#user-message').val();
            DraftStorage.saveDraft(currentConversationId, currentText);
        }

        pendingAttachments = [];
        ChatUI.renderAttachmentPreviews([]);

        currentConversationId = id;
        ChatUI.clearMessages();
        ChatUI.showChatState();
        ChatUI.updateChatHeader(conv.title);

        if (conv.messages && conv.messages.length > 0) {
            conv.messages.forEach((m, idx) => {
                ChatUI.appendMessage(m.role, m.content, {
                    attachments:       m.attachments || [],
                    reasoning_content: m.reasoning_content || '',
                    error:             m.error || null,  // Restore error state
                    messageIndex:      idx,
                    convId:            id,
                    data_source:       m.data_source || null  // Restore data source
                });
            });
        } else {
            ChatUI.showStartChatting();
        }

        // Restore draft for this conversation
        const draft = DraftStorage.getDraft(id);
        $('#user-message').val(draft);
        ChatUI.autoResize($('#user-message')[0]);

        refreshSidebar();
        ChatUI.scrollToBottom();
        setTimeout(() => $('#user-message').focus(), 50);
    }

    function newConversation() {
        pendingAttachments = [];
        ChatUI.renderAttachmentPreviews([]);

        const conv = ConversationStorage.create();
        currentConversationId = conv.id;

        ChatUI.closeDropdowns();
        ChatUI.clearMessages();
        ChatUI.showChatState();
        ChatUI.showStartChatting();
        ChatUI.updateChatHeader('New Chat');

        $('#user-message').val('');
        ChatUI.autoResize($('#user-message')[0]);

        refreshSidebar();
        setTimeout(() => $('#user-message').focus(), 50);
    }

    function deleteConversation(id) {
        frappe.confirm('Are you sure you want to delete this conversation?', () => {
            ConversationStorage.deleteById(id);

            if (currentConversationId === id) {
                const remaining = ConversationStorage.getAll();
                if (remaining.length > 0) {
                    loadConversation(remaining[0].id);
                } else {
                    currentConversationId = null;
                    ChatUI.showEmptyState();
                }
            }

            refreshSidebar();
            frappe.show_alert({ message: 'Conversation deleted', indicator: 'red' }, 2);
        });
    }

    // ---- File uploads ----
    async function uploadPendingAttachments() {
        const uploaded = [];
        for (const att of pendingAttachments) {
            try {
                const result = await ChatApiService.uploadFile(att.file);
                uploaded.push(result);
                $(`.attachment-preview-item[data-id="${att.id}"] .thumb`).removeClass('uploading');
            } catch (err) {
                frappe.show_alert({ message: `Upload failed: ${att.name}`, indicator: 'red' }, 3);
            }
        }
        return uploaded;
    }

    // ---- Retry failed message (without creating duplicate) ----
    async function retryFailedMessage(convId, messageIndex) {
        if (isStreaming) return;

        const conv = ConversationStorage.getById(convId);
        if (!conv || !conv.messages[messageIndex]) return;

        currentConversationId = convId;
        const userMsg = conv.messages[messageIndex];
        const message = userMsg.content;

        isStreaming = true;
        cancelStreaming = false;
        ChatUI.setSendState(true);

        // Remove error UI from the message
        $(`#chat-messages .message.user`).last().find('.msg-error').remove();

        // Show thinking state
        ChatUI.showThinking();

        // Build history (all messages except this one)
        const history = conv.messages.slice(0, messageIndex);

        try {
            const result = await ChatApiService.sendMessage(message, history);
            ChatUI.removeThinking();

            // Create streaming placeholder
            const streamHandle = ChatUI.createStreamingMessage();

            // Stream reasoning first (if present)
            if (result.reasoning_content) {
                await ChatApiService.simulateStream(
                    result.reasoning_content,
                    chunk => streamHandle.appendReasoning(chunk),
                    () => cancelStreaming,
                    5
                );
                streamHandle.finishReasoning();
            }

            if (cancelStreaming) {
                streamHandle.finalise(result.content, result.reasoning_content);
            } else {
                // Stream main content
                await ChatApiService.simulateStream(
                    result.content,
                    chunk => streamHandle.appendContent(chunk),
                    () => cancelStreaming,
                    8
                );
                streamHandle.finalise(result.content, result.reasoning_content);
            }

            // Remove error/interrupted message from the user bubble (success!)
            const userMessageEl = $(`#chat-messages .message.user`).last();
            userMessageEl.find('.msg-error').remove();
            userMessageEl.find('.msg-interrupted').remove();

            // Clear the error state from storage
            userMsg.error = null;
            ConversationStorage.save(conv);

            // Update the streaming message with data source
            streamHandle.setDataSource(result.data_source);

            // Persist assistant message
            const assistantMsg = {
                role: 'assistant',
                content: result.content,
                reasoning_content: result.reasoning_content || undefined,
                data_source: result.data_source || undefined
            };
            ConversationStorage.addMessage(convId, assistantMsg);

        } catch (err) {
            ChatUI.removeThinking();

            if (err.code === 'CANCELLED') {
                // User stopped the message - show "Interrupted" with retry button
                const userMessageBubble = $(`#chat-messages .message.user`).last().find('.bubble');
                const interruptedHtml = `
                    <div class="msg-error msg-interrupted">
                        <div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            Interrupted
                        </div>
                        <button class="retry-btn" data-msg-index="${messageIndex}" data-conv-id="${convId}">Try again</button>
                    </div>`;
                
                userMessageBubble.append(interruptedHtml);
                
                // Store interrupted state to localStorage so it persists on reload
                userMsg.error = {
                    message: 'Interrupted',
                    isInterrupted: true,
                    timestamp: new Date().toISOString()
                };
                ConversationStorage.save(conv);
                
                // Bind retry button
                const interruptedMsg = userMessageBubble.find('.msg-interrupted');
                if (interruptedMsg.length) {
                    interruptedMsg.find('.retry-btn').on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const msgIdx = parseInt($(this).attr('data-msg-index'));
                        const cId = $(this).attr('data-conv-id');
                        retryFailedMessage(cId, msgIdx);
                    });
                }
            } else {
                // Show error again
                const userMessageBubble = $(`#chat-messages .message.user`).last().find('.bubble');
                const errorHtml = `
                    <div class="msg-error">
                        <div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            ${err.message || 'An error occurred. Please try again.'}
                        </div>
                        <button class="retry-btn" data-msg-index="${messageIndex}" data-conv-id="${convId}">Try again</button>
                    </div>`;
                
                userMessageBubble.append(errorHtml);
                
                // Bind retry button using event delegation on the bubble
                const errorMsg = userMessageBubble.find('.msg-error');
                if (errorMsg.length) {
                    errorMsg.find('.retry-btn').on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const msgIdx = parseInt($(this).attr('data-msg-index'));
                        const cId = $(this).attr('data-conv-id');
                        retryFailedMessage(cId, msgIdx);
                    });
                }
                
                // Update error state in storage
                userMsg.error = {
                    message: err.message || 'An error occurred. Please try again.',
                    timestamp: new Date().toISOString()
                };
                ConversationStorage.save(conv);
            }
        } finally {
            isStreaming = false;
            cancelStreaming = false;
            ChatUI.setSendState(false);
            setTimeout(() => $('#user-message').focus(), 50);
        }
    }

    // ---- Send message ----
    async function sendMessage() {
        if (isStreaming) return;

        const textarea = $('#user-message');
        const message  = textarea.val().trim();

        if (!message && pendingAttachments.length === 0) return;

        // Ensure we have an active conversation
        if (!currentConversationId || !ConversationStorage.getById(currentConversationId)) {
            newConversation();
        }

        isStreaming    = true;
        cancelStreaming = false;
        ChatUI.setSendState(true);

        // Upload attachments first
        let uploadedFiles = [];
        if (pendingAttachments.length > 0) {
            uploadedFiles     = await uploadPendingAttachments();
            pendingAttachments = [];
            ChatUI.renderAttachmentPreviews([]);
        }

        if (!message && uploadedFiles.length === 0) {
            isStreaming = false;
            ChatUI.setSendState(false);
            return;
        }

        // Persist user message
        const userMsg = {
            role:        'user',
            content:     message || '',
            attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        };
        ConversationStorage.addMessage(currentConversationId, userMsg);

        // Auto-title
        const conv = ConversationStorage.getById(currentConversationId);
        if (conv) {
            const userCount = conv.messages.filter(m => m.role === 'user').length;
            if (userCount === 1 && message) {
                const title = ConversationStorage.autoTitle(message, MAX_TITLE_LENGTH);
                ConversationStorage.rename(currentConversationId, title);
                ChatUI.updateChatHeader(title);
            }
        }

        // Render user message immediately
        ChatUI.appendMessage('user', userMsg.content, { attachments: uploadedFiles });
        textarea.val('');
        ChatUI.autoResize(textarea[0]);
        
        // Clear draft for this conversation
        DraftStorage.clearDraft(currentConversationId);
        
        $('.start-chatting').remove();

        refreshSidebar(); // re-sort so this conv floats to top

        // Show thinking state
        ChatUI.showThinking();

        // Build history for the API (all prior messages)
        const freshConv = ConversationStorage.getById(currentConversationId);
        const history   = freshConv
            ? freshConv.messages.slice(0, -1) // exclude the message we just added (it's the "latest")
            : [];

        try {
            const result = await ChatApiService.sendMessage(message, history);
            ChatUI.removeThinking();

            // Create streaming placeholder
            const streamHandle = ChatUI.createStreamingMessage();

            // Stream reasoning first (if present)
            if (result.reasoning_content) {
                await ChatApiService.simulateStream(
                    result.reasoning_content,
                    chunk => streamHandle.appendReasoning(chunk),
                    () => cancelStreaming,
                    5  // slightly faster for reasoning
                );
                streamHandle.finishReasoning();
            }

            if (cancelStreaming) {
                streamHandle.finalise(result.content, result.reasoning_content);
            } else {
                // Stream main content
                await ChatApiService.simulateStream(
                    result.content,
                    chunk => streamHandle.appendContent(chunk),
                    () => cancelStreaming,
                    8
                );
                streamHandle.finalise(result.content, result.reasoning_content);
            }

            // Persist assistant message
            const assistantMsg = {
                role:              'assistant',
                content:           result.content,
                reasoning_content: result.reasoning_content || undefined,
                data_source:       result.data_source || undefined
            };
            ConversationStorage.addMessage(currentConversationId, assistantMsg);

            // Update the streaming message with data source
            streamHandle.setDataSource(result.data_source);

            // Refresh sidebar to update last_updated ordering
            refreshSidebar();

        } catch (err) {
            ChatUI.removeThinking();

            if (err.code === 'CANCELLED') {
                // User cancelled — show partial content if any, else remove the row
                // (the streamHandle may or may not exist — safe to ignore)
            } else {
                // Persist error state to the last user message
                const conv = ConversationStorage.getById(currentConversationId);
                if (conv && conv.messages.length > 0 && conv.messages[conv.messages.length - 1].role === 'user') {
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    lastMsg.error = {
                        message: err.message || 'An error occurred. Please try again.',
                        timestamp: new Date().toISOString()
                    };
                    ConversationStorage.save(conv);
                }

                // Show error in the user message bubble (not as a separate assistant message)
                const userMessageBubble = $('#chat-messages .message.user').last().find('.bubble');
                const messageIndex = (conv && conv.messages) ? conv.messages.length - 1 : null;
                const convId = currentConversationId;
                
                const errorHtml = `
                    <div class="msg-error">
                        <div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            ${err.message || 'An error occurred. Please try again.'}
                        </div>
                        <button class="retry-btn" data-msg-index="${messageIndex}" data-conv-id="${convId}">Try again</button>
                    </div>`;
                
                userMessageBubble.append(errorHtml);
                
                // Bind retry button using event delegation
                const errorMsg = userMessageBubble.find('.msg-error');
                if (errorMsg.length) {
                    errorMsg.find('.retry-btn').on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const msgIdx = parseInt($(this).attr('data-msg-index'));
                        const cId = $(this).attr('data-conv-id');
                        retryFailedMessage(cId, msgIdx);
                    });
                }
            }
        } finally {
            isStreaming    = false;
            cancelStreaming = false;
            ChatUI.setSendState(false);
            setTimeout(() => $('#user-message').focus(), 50);
        }
    }

    function stopStreaming() {
        if (isStreaming) {
            cancelStreaming = true;
            ChatApiService.cancel();
        }
    }


    // =========================================================================
    // EVENT BINDINGS
    // =========================================================================

    // Send
    $('#send-btn').on('click', sendMessage);
    
    // Draft saving with 1.5 second debounce
    let draftTimeout = null;
    $('#user-message')
        .on('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        })
        .on('input', function () {
            ChatUI.autoResize(this);
            
            // Clear existing draft timeout
            if (draftTimeout) clearTimeout(draftTimeout);
            
            // Set new timeout to save draft after 1.5 seconds of inactivity
            draftTimeout = setTimeout(() => {
                const text = $(this).val();
                if (currentConversationId) {
                    DraftStorage.saveDraft(currentConversationId, text);
                }
                draftTimeout = null;
            }, 1500);
        });

    // Stop
    $('#stop-btn').on('click', stopStreaming);

    // New chat
    $('#compose-btn').on('click', () => { ChatUI.closeDropdowns(); newConversation(); });

    // Sidebar collapse / expand
    $('#collapse-sidebar-btn').on('click', () => {
        $('#sidebar').addClass('collapsed');
        $('#expand-sidebar-btn').show();
    });
    $('#expand-sidebar-btn').on('click', () => {
        $('#sidebar').removeClass('collapsed');
        $('#expand-sidebar-btn').hide();
    });

    // Search
    $('#search-input').on('input', refreshSidebar);

    // Attach file
    $('#attach-btn').on('click', () => $('#file-input').click());
    $('#file-input').on('change', function (e) {
        const files       = Array.from(e.target.files);
        const maxSize     = 10 * 1024 * 1024;
        const allowedTypes= ['image/jpeg','image/png','image/gif','image/webp',
                             'application/pdf','application/msword',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'text/plain'];
        for (const file of files) {
            if (pendingAttachments.length >= 3) {
                frappe.show_alert({ message: 'Maximum 3 attachments allowed', indicator: 'red' }, 2);
                break;
            }
            if (!allowedTypes.includes(file.type)) {
                frappe.show_alert({ message: `File type not allowed: ${file.name}`, indicator: 'red' }, 2);
                continue;
            }
            if (file.size > maxSize) {
                frappe.show_alert({ message: `File too large: ${file.name}`, indicator: 'red' }, 2);
                continue;
            }
            pendingAttachments.push({
                id:   'att_' + Date.now() + Math.random(),
                file, name: file.name, size: file.size, type: file.type
            });
        }
        this.value = '';
        ChatUI.renderAttachmentPreviews(pendingAttachments);
    });
    // Remove attachment
    $(document).on('click', '.remove-file', function (e) {
        e.stopPropagation();
        const id = $(this).data('id');
        pendingAttachments = pendingAttachments.filter(a => a.id !== id);
        ChatUI.renderAttachmentPreviews(pendingAttachments);
    });

    // Theme toggle
    $('#theme-toggle-btn').on('click', () => {
        isDarkMode = !isDarkMode;
        ChatUI.applyTheme(isDarkMode);
    });

    // Settings / connection
    $('.settings-btn').on('click', openSettingsDialog);
    $('#connect-mcp-btn').on('click', async () => {
        if (OAuthService.getStatus().connected) {
            openSettingsDialog();
            return;
        }

        const connected = await connectMcp(true);
        if (!connected) {
            openSettingsDialog();
        }
    });

    // Close dropdowns on outside click
    $(document).on('click', e => {
        if (!$(e.target).closest('.dropdown-menu, .more-btn').length) {
            ChatUI.closeDropdowns();
        }
    });

    // Lightbox close
    $(document).on('click', '#lightbox-close, .lightbox-overlay', () => {
        $('#lightbox-modal').removeClass('show');
        $('#lightbox-image').attr('src', '');
    });
    $(document).on('keydown', e => {
        if (e.key === 'Escape' && $('#lightbox-modal').hasClass('show')) {
            $('#lightbox-modal').removeClass('show');
        }
    });


    // =========================================================================
    // INIT
    // =========================================================================
    updateUserIdentity();

    try {
        const oauthResult = await OAuthService.completeAuthorizationIfPresent();
        if (oauthResult.handled) {
            frappe.show_alert({ message: 'ERPNext MCP connected successfully.', indicator: 'green' }, 4);
        }
    } catch (err) {
        frappe.show_alert({
            message: err.message || 'Failed to complete ERPNext MCP authentication.',
            indicator: 'red',
        }, 6);
    }

    ChatUI.applyTheme(isDarkMode);
    ChatUI.setSendState(false); // ensure stop-btn is hidden
    updateConnectionBadge();

    ChatUI.showEmptyState();
    refreshSidebar();

    // Textarea initial size
    const ta = $('#user-message')[0];
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 44) + 'px'; }
};
