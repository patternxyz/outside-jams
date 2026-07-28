import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  type ArtistImage,
  type Performance,
  useArtistsQuery,
  useDisconnectSpotifyMutation,
  usePerformancesQuery,
  useSpotifyStatusQuery,
  useSpotifySyncStatusQuery,
  useTagsQuery,
} from "@/api/outside-jams";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALL_DAYS = "all";
const SPOTIFY_STATUS_TOAST_ID = "spotify-status";

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const performanceTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
});

function getThumbnail(images: ArtistImage[] | null): ArtistImage | null {
  return images?.find((image) => image.width === 320) ?? images?.[0] ?? null;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatPerformance(performance: Performance): string {
  if (performance.startTime) {
    return performanceTimeFormatter.format(new Date(performance.startTime));
  }

  return weekdayFormatter.format(parseDateOnly(performance.date));
}

function groupPerformancesByArtist(performances: Performance[]): Map<string, Performance[]> {
  const performancesByArtist = new Map<string, Performance[]>();

  for (const performance of performances) {
    const artistPerformances = performancesByArtist.get(performance.artistId) ?? [];
    artistPerformances.push(performance);
    performancesByArtist.set(performance.artistId, artistPerformances);
  }

  return performancesByArtist;
}

function formatTag(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(ALL_DAYS);
  const callbackResult = new URLSearchParams(window.location.search).get("spotify");
  const callbackError =
    callbackResult === "denied"
      ? "Spotify connection was cancelled."
      : callbackResult === "error"
        ? "Spotify could not be connected. Please try again."
        : null;
  const statusQuery = useSpotifyStatusQuery();
  const syncStatusQuery = useSpotifySyncStatusQuery(statusQuery.data?.connected === true);
  const tagsQuery = useTagsQuery(syncStatusQuery.data?.lastSyncStatus === "completed");
  const artistsQuery = useArtistsQuery();
  const performancesQuery = usePerformancesQuery();
  const disconnectMutation = useDisconnectSpotifyMutation();
  const performancesByArtist = groupPerformancesByArtist(performancesQuery.data ?? []);
  const tagsByArtist = new Map(
    (tagsQuery.data ?? []).map((artistTags) => [artistTags.artistId, artistTags.tags])
  );
  const performanceDates = [
    ...new Set((performancesQuery.data ?? []).map((performance) => performance.date)),
  ].sort();
  const visibleArtists = artistsQuery.data?.filter(
    (artist) =>
      selectedDate === ALL_DAYS ||
      performancesByArtist.get(artist.id)?.some((performance) => performance.date === selectedDate)
  );

  useEffect(() => {
    const options = { id: SPOTIFY_STATUS_TOAST_ID };

    if (callbackError) {
      toast.error(callbackError, options);
      return;
    }

    if (disconnectMutation.isPending) {
      toast.loading("Disconnecting Spotify…", options);
      return;
    }

    if (disconnectMutation.isError) {
      toast.error("Spotify could not be disconnected. Please try again.", options);
      return;
    }

    if (statusQuery.isPending) {
      toast.loading("Checking your Spotify connection…", options);
      return;
    }

    if (statusQuery.isError) {
      toast.error("Unable to check your Spotify connection.", options);
      return;
    }

    if (!statusQuery.data.connected) {
      toast.dismiss(SPOTIFY_STATUS_TOAST_ID);
      return;
    }

    const connectedDescription = `Connected as ${statusQuery.data.displayName}.`;

    if (syncStatusQuery.isPending) {
      toast.loading("Preparing your Spotify sync…", {
        ...options,
        description: connectedDescription,
      });
      return;
    }

    if (syncStatusQuery.isError) {
      toast.error("Unable to check your Spotify sync.", {
        ...options,
        description: connectedDescription,
      });
      return;
    }

    const syncStatus = syncStatusQuery.data.lastSyncStatus;
    if (syncStatus === "completed") {
      toast.success("Spotify sync completed.", {
        ...options,
        description: connectedDescription,
      });
    } else if (syncStatus === "failed") {
      toast.error("Spotify sync failed.", {
        ...options,
        description: syncStatusQuery.data.lastUpdate ?? connectedDescription,
      });
    } else {
      toast.loading("Syncing Spotify…", {
        ...options,
        description: syncStatusQuery.data.lastUpdate ?? "Waiting for sync to start…",
      });
    }
  }, [
    callbackError,
    disconnectMutation.isError,
    disconnectMutation.isPending,
    statusQuery.data,
    statusQuery.isError,
    statusQuery.isPending,
    syncStatusQuery.data,
    syncStatusQuery.isError,
    syncStatusQuery.isPending,
  ]);

  function disconnectSpotify() {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => window.history.replaceState({}, "", window.location.pathname),
    });
  }

  return (
    <main className="min-h-svh p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Spotify</CardTitle>
            <CardDescription>Connect your account to personalize Outside Jams.</CardDescription>
          </CardHeader>
          <CardFooter>
            {statusQuery.data?.connected ? (
              <Button
                variant="destructive"
                disabled={disconnectMutation.isPending}
                onClick={disconnectSpotify}
              >
                {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect Spotify"}
              </Button>
            ) : (
              <Button onClick={() => window.location.assign("/api/auth/spotify")}>
                Connect Spotify
              </Button>
            )}
          </CardFooter>
        </Card>

        {statusQuery.data?.connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Artists</CardTitle>
              <CardDescription>Outside Lands 2026 artists.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedDate} onValueChange={(value) => setSelectedDate(String(value))}>
                <TabsList>
                  <TabsTrigger value={ALL_DAYS}>All Days</TabsTrigger>
                  {performanceDates.map((date) => (
                    <TabsTrigger key={date} value={date}>
                      {weekdayFormatter.format(parseDateOnly(date))}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value={selectedDate}>
                  {artistsQuery.isError ? (
                    <p role="alert" className="text-destructive">
                      Unable to load artists. Please try again later.
                    </p>
                  ) : visibleArtists ? (
                    <div className="flex flex-col gap-3">
                      {tagsQuery.isError ? (
                        <p role="alert" className="text-destructive">
                          Unable to load your artist tags.
                        </p>
                      ) : null}
                      <ItemGroup className="grid gap-3 sm:grid-cols-2">
                        {visibleArtists.map((artist) => {
                          const thumbnail = getThumbnail(artist.images);
                          const artistTags = tagsByArtist.get(artist.id) ?? [];
                          const performanceSummary = performancesByArtist
                            .get(artist.id)
                            ?.map(formatPerformance)
                            .join(", ");

                          return (
                            <Item key={artist.id} role="listitem" variant="outline" size="sm">
                              <ItemMedia variant="image">
                                {thumbnail ? (
                                  <img src={thumbnail.url} alt="" loading="lazy" />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="flex size-full items-center justify-center bg-muted text-xs font-medium text-muted-foreground"
                                  >
                                    {getInitials(artist.name)}
                                  </span>
                                )}
                              </ItemMedia>
                              <ItemContent>
                                <ItemTitle>
                                  {artist.name}
                                  {artistTags.map((tag) => (
                                    <Badge key={tag} variant="secondary">
                                      {formatTag(tag)}
                                    </Badge>
                                  ))}
                                </ItemTitle>
                                {performanceSummary ? (
                                  <ItemDescription>{performanceSummary}</ItemDescription>
                                ) : null}
                              </ItemContent>
                            </Item>
                          );
                        })}
                      </ItemGroup>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Loading artists…</p>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
