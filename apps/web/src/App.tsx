import { useState } from "react";

import {
  type ArtistImage,
  type Performance,
  useArtistsQuery,
  useDisconnectSpotifyMutation,
  usePerformancesQuery,
  useSpotifyStatusQuery,
} from "@/api/outside-jams";
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
  const artistsQuery = useArtistsQuery();
  const performancesQuery = usePerformancesQuery();
  const disconnectMutation = useDisconnectSpotifyMutation();
  const performancesByArtist = groupPerformancesByArtist(performancesQuery.data ?? []);
  const performanceDates = [
    ...new Set((performancesQuery.data ?? []).map((performance) => performance.date)),
  ].sort();
  const visibleArtists = artistsQuery.data?.filter(
    (artist) =>
      selectedDate === ALL_DAYS ||
      performancesByArtist.get(artist.id)?.some((performance) => performance.date === selectedDate)
  );
  const connectionError = callbackError
    ? callbackError
    : statusQuery.isError
      ? "Unable to check your Spotify connection."
      : disconnectMutation.isError
        ? "Spotify could not be disconnected. Please try again."
        : null;

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
          <CardContent>
            {connectionError ? (
              <p role="alert" className="text-destructive">
                {connectionError}
              </p>
            ) : statusQuery.data?.connected ? (
              <p>
                Connected as <strong>{statusQuery.data.displayName}</strong>
              </p>
            ) : statusQuery.data ? (
              <p className="text-muted-foreground">No Spotify account connected.</p>
            ) : (
              <p className="text-muted-foreground">Checking connection…</p>
            )}
          </CardContent>
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
                    <ItemGroup className="grid gap-3 sm:grid-cols-2">
                      {visibleArtists.map((artist) => {
                        const thumbnail = getThumbnail(artist.images);
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
                              <ItemTitle>{artist.name}</ItemTitle>
                              {performanceSummary ? (
                                <ItemDescription>{performanceSummary}</ItemDescription>
                              ) : null}
                            </ItemContent>
                          </Item>
                        );
                      })}
                    </ItemGroup>
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
