"use client";

import { useCallback } from "react";
import { streams, useEventStream, useResource, type Audience, type Resource, type StreamState } from "@/lib/api";

/**
 * A staff list that stays current: it refetches when the staff stream says `refresh`,
 * and also on a slow timer in case the stream is down.
 */
export function useLive<T>(fetcher: () => Promise<T>, audience: Audience): Resource<T> & { stream: StreamState } {
  const resource = useResource(fetcher, { pollMs: 30_000 });
  const reload = resource.reload;
  const refresh = useCallback(() => { void reload(); }, [reload]);
  const stream = useEventStream(streams.staff(audience), { refresh });
  return { ...resource, stream };
}
