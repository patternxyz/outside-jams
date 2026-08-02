import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SpotifyStatus = {
  connected: boolean;
  displayName?: string;
};

export type SpotifySyncStatus = {
  lastSyncStatus: "started" | "completed" | "failed" | null;
  lastUpdate: string | null;
};

export type SpotifyProfile = {
  name: string;
  image: string | null;
};

export type ArtistTags = {
  artistId: string;
  tags: string[];
};

export type ArtistImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type Artist = {
  id: string;
  name: string;
  spotifyId: string | null;
  spotifyUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  images: ArtistImage[] | null;
};

export type Performance = {
  id: string;
  artistId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
};

const queryKeys = {
  artists: ["artists"] as const,
  performances: ["performances"] as const,
  spotifyStatus: ["spotify", "status"] as const,
  spotifyProfile: ["spotify", "profile"] as const,
  spotifySyncStatus: ["spotify", "sync-status"] as const,
  tags: ["tags"] as const,
};

export const queryClient = new QueryClient();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function useSpotifyStatusQuery() {
  return useQuery({
    queryKey: queryKeys.spotifyStatus,
    queryFn: ({ signal }) => requestJson<SpotifyStatus>("/api/auth/spotify/status", { signal }),
  });
}

export function useSpotifySyncStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.spotifySyncStatus,
    queryFn: ({ signal }) =>
      requestJson<SpotifySyncStatus>("/api/auth/spotify/sync-status", { signal }),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.lastSyncStatus;
      return status === "completed" || status === "failed" ? false : 1_500;
    },
  });
}

export function useSpotifyProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.spotifyProfile,
    queryFn: ({ signal }) => requestJson<SpotifyProfile>("/api/auth/spotify/profile", { signal }),
    enabled,
  });
}

export function useTagsQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: ({ signal }) => requestJson<ArtistTags[]>("/api/tags", { signal }),
    enabled,
  });
}

export function useArtistsQuery() {
  return useQuery({
    queryKey: queryKeys.artists,
    queryFn: ({ signal }) => requestJson<Artist[]>("/api/artists", { signal }),
    staleTime: 5 * 60 * 1_000,
  });
}

export function usePerformancesQuery() {
  return useQuery({
    queryKey: queryKeys.performances,
    queryFn: ({ signal }) => requestJson<Performance[]>("/api/performances", { signal }),
    staleTime: 5 * 60 * 1_000,
  });
}

export function useDisconnectSpotifyMutation() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestJson<{ connected: false }>("/api/auth/spotify", {
        method: "DELETE",
      }),
    onSuccess: (status) => {
      client.setQueryData(queryKeys.spotifyStatus, status);
      client.removeQueries({ queryKey: queryKeys.spotifyProfile });
      client.removeQueries({ queryKey: queryKeys.spotifySyncStatus });
      client.removeQueries({ queryKey: queryKeys.tags });
    },
  });
}
