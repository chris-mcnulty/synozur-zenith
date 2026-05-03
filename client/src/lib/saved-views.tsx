import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SavedViewPage } from "@shared/schema";

export type ViewState = {
  filterJson: Record<string, unknown>;
  sortJson: Record<string, unknown>;
  columnsJson: Record<string, unknown>;
};

export type SavedViewWire = {
  id: string;
  organizationId: string | null;
  ownerUserId: string | null;
  page: SavedViewPage;
  name: string;
  description?: string;
  filterJson: Record<string, unknown>;
  sortJson: Record<string, unknown>;
  columnsJson: Record<string, unknown>;
  scope: "PRIVATE" | "ORG" | "BUILT_IN";
  pinnedByUserIds: string[];
  isPinned: boolean;
  isBuiltIn: boolean;
  isOwner: boolean;
  isDefault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SavedViewsListResponse = {
  my: SavedViewWire[];
  shared: SavedViewWire[];
  builtIn: SavedViewWire[];
};

const VIEW_QUERY_KEY = "view";
const STATE_QUERY_KEY = "vs";

function safeBase64Encode(value: string): string {
  // URL-safe base64 (RFC 4648 §5) so the state survives a copy-paste through
  // chat clients that mangle "+", "/", and "=".
  if (typeof window === "undefined") return "";
  const utf8 = new TextEncoder().encode(value);
  let binary = "";
  utf8.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeBase64Decode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeStateToUrlValue(state: ViewState): string {
  return safeBase64Encode(JSON.stringify(state));
}

export function decodeStateFromUrlValue(value: string): ViewState | null {
  const json = safeBase64Decode(value);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      filterJson: (parsed.filterJson ?? {}) as Record<string, unknown>,
      sortJson: (parsed.sortJson ?? {}) as Record<string, unknown>,
      columnsJson: (parsed.columnsJson ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function writeSearchParams(params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function setViewIdInUrl(id: string | null) {
  const params = readSearchParams();
  if (id) {
    params.set(VIEW_QUERY_KEY, id);
    params.delete(STATE_QUERY_KEY);
  } else {
    params.delete(VIEW_QUERY_KEY);
  }
  writeSearchParams(params);
}

export function setViewStateInUrl(state: ViewState | null) {
  const params = readSearchParams();
  if (!state) {
    params.delete(STATE_QUERY_KEY);
  } else {
    const empty =
      Object.keys(state.filterJson || {}).length === 0 &&
      Object.keys(state.sortJson || {}).length === 0 &&
      Object.keys(state.columnsJson || {}).length === 0;
    if (empty) params.delete(STATE_QUERY_KEY);
    else params.set(STATE_QUERY_KEY, encodeStateToUrlValue(state));
  }
  writeSearchParams(params);
}

export function readInitialUrlState(): { viewId: string | null; state: ViewState | null } {
  const params = readSearchParams();
  const viewId = params.get(VIEW_QUERY_KEY);
  const stateRaw = params.get(STATE_QUERY_KEY);
  return {
    viewId: viewId || null,
    state: stateRaw ? decodeStateFromUrlValue(stateRaw) : null,
  };
}

export function buildShareableUrl(opts: { viewId?: string | null; state?: ViewState | null }): string {
  if (typeof window === "undefined") return "";
  const params = readSearchParams();
  params.delete(VIEW_QUERY_KEY);
  params.delete(STATE_QUERY_KEY);
  if (opts.viewId) {
    params.set(VIEW_QUERY_KEY, opts.viewId);
  } else if (opts.state) {
    const encoded = encodeStateToUrlValue(opts.state);
    if (encoded) params.set(STATE_QUERY_KEY, encoded);
  }
  const search = params.toString();
  const base = `${window.location.origin}${window.location.pathname}`;
  return search ? `${base}?${search}` : base;
}

export function useSavedViewsList(page: SavedViewPage, enabled = true) {
  return useQuery<SavedViewsListResponse>({
    queryKey: ["/api/saved-views", page],
    queryFn: async () => {
      const res = await fetch(`/api/saved-views?page=${encodeURIComponent(page)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load views (${res.status})`);
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Wires up a page's filter/sort/column state to the saved-views infrastructure:
 *
 *  - Reads `?view=<id>` and `?vs=<encoded>` from the URL on mount and emits
 *    an initial state via `onApply`. URL takes precedence over local defaults.
 *  - Exposes helpers to apply a view by id/object, mirror state to URL, and
 *    derive a shareable link.
 *
 * The page is responsible for translating its local filter/sort/column state
 * into a `ViewState` (`buildState`) and applying a `ViewState` back into its
 * local state (`applyState`).
 */
export function useSavedViewController<TState extends ViewState>(opts: {
  page: SavedViewPage;
  buildState: () => TState;
  applyState: (state: ViewState) => void;
  enabled?: boolean;
}) {
  const { page, buildState, applyState, enabled = true } = opts;
  const initialAppliedRef = useRef(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [allViews, setAllViews] = useState<SavedViewWire[]>([]);

  const list = useSavedViewsList(page, enabled);

  useEffect(() => {
    if (!list.data) return;
    setAllViews([...list.data.my, ...list.data.shared, ...list.data.builtIn]);
  }, [list.data]);

  // On first mount (after the views list has resolved if a view id is present
  // in the URL), pull initial state.
  // Priority: 1) ?view= URL param, 2) ?vs= URL state, 3) org default view.
  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!enabled) return;
    const { viewId, state } = readInitialUrlState();
    if (viewId) {
      // Wait for views to load so we can resolve the view's state.
      if (!list.data) return;
      const all = [...list.data.my, ...list.data.shared, ...list.data.builtIn];
      const found = all.find((v) => v.id === viewId);
      if (found) {
        applyState({
          filterJson: found.filterJson || {},
          sortJson: found.sortJson || {},
          columnsJson: found.columnsJson || {},
        });
        setActiveViewId(found.id);
      }
      initialAppliedRef.current = true;
      return;
    }
    if (state) {
      applyState(state);
      initialAppliedRef.current = true;
      return;
    }
    // No URL params — check for an org default view and apply it silently.
    if (list.data) {
      const defaultView = list.data.shared.find((v) => v.isDefault);
      if (defaultView) {
        applyState({
          filterJson: defaultView.filterJson || {},
          sortJson: defaultView.sortJson || {},
          columnsJson: defaultView.columnsJson || {},
        });
        setActiveViewId(defaultView.id);
        setViewIdInUrl(defaultView.id);
      }
      initialAppliedRef.current = true;
      return;
    }
    // Views haven't loaded yet — wait for them before committing.
  }, [list.data, enabled, applyState]);

  const applyView = useCallback(
    (view: SavedViewWire) => {
      applyState({
        filterJson: view.filterJson || {},
        sortJson: view.sortJson || {},
        columnsJson: view.columnsJson || {},
      });
      setActiveViewId(view.id);
      setViewIdInUrl(view.id);
    },
    [applyState],
  );

  const clearActiveView = useCallback(() => {
    setActiveViewId(null);
    setViewIdInUrl(null);
  }, []);

  const syncStateToUrl = useCallback(() => {
    if (!initialAppliedRef.current) return;
    const state = buildState();
    if (activeViewId) return; // active view id is the canonical URL representation
    setViewStateInUrl(state);
  }, [activeViewId, buildState]);

  const shareableUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (activeViewId) return buildShareableUrl({ viewId: activeViewId });
    return buildShareableUrl({ state: buildState() });
  }, [activeViewId, buildState]);

  return {
    activeViewId,
    setActiveViewId,
    applyView,
    clearActiveView,
    syncStateToUrl,
    shareableUrl,
    list,
    allViews,
    refetch: list.refetch,
  };
}
