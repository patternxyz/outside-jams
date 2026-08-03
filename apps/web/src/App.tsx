import { useEffect, useRef, useState } from "react";
import { ExternalLink, Heart, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { toast } from "sonner";

import {
  type Artist,
  type ArtistImage,
  type Performance,
  useArtistsQuery,
  useDisconnectSpotifyMutation,
  usePerformancesQuery,
  useSpotifyProfileQuery,
  useSpotifyStatusQuery,
  useSpotifySyncStatusQuery,
  useTagsQuery,
  useTracksQuery,
} from "@/api/outside-jams";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MY_ARTISTS = "my-artists";
const SPOTIFY_STATUS_TOAST_ID = "spotify-status";

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const performanceTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
});
const performanceEndTimeFormatter = new Intl.DateTimeFormat(undefined, {
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

function formatPerformanceDetails(performance: Performance): string {
  if (!performance.startTime) {
    return weekdayFormatter.format(parseDateOnly(performance.date));
  }

  const start = performanceTimeFormatter.format(new Date(performance.startTime));
  const end = performance.endTime
    ? ` – ${performanceEndTimeFormatter.format(new Date(performance.endTime))}`
    : "";
  const stage = performance.location ? ` · ${performance.location}` : "";

  return `${start}${end}${stage}`;
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
  const [selectedDate, setSelectedDate] = useState(MY_ARTISTS);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [favoriteTrackUris, setFavoriteTrackUris] = useState<Set<string>>(() => new Set());
  const audioRef = useRef<HTMLAudioElement>(null);
  const callbackResult = new URLSearchParams(window.location.search).get("spotify");
  const callbackError =
    callbackResult === "denied"
      ? "Spotify connection was cancelled."
      : callbackResult === "error"
        ? "Spotify could not be connected. Please try again."
        : null;
  const statusQuery = useSpotifyStatusQuery();
  const profileQuery = useSpotifyProfileQuery(statusQuery.data?.connected === true);
  const syncStatusQuery = useSpotifySyncStatusQuery(statusQuery.data?.connected === true);
  const tagsQuery = useTagsQuery(syncStatusQuery.data?.lastSyncStatus === "completed");
  const artistsQuery = useArtistsQuery();
  const performancesQuery = usePerformancesQuery();
  const tracksQuery = useTracksQuery(selectedArtist?.id ?? null);
  const disconnectMutation = useDisconnectSpotifyMutation();
  const profileName = profileQuery.data?.name ?? statusQuery.data?.displayName ?? "Spotify user";
  const profileImage = profileQuery.data?.image ?? null;
  const syncStatus = syncStatusQuery.data?.lastSyncStatus;
  const isSyncInProgress =
    syncStatusQuery.isPending || (syncStatus !== "completed" && syncStatus !== "failed");
  const performancesByArtist = groupPerformancesByArtist(performancesQuery.data ?? []);
  const tagsByArtist = new Map(
    (tagsQuery.data ?? []).map((artistTags) => [artistTags.artistId, artistTags.tags])
  );
  const performanceDates = [
    ...new Set((performancesQuery.data ?? []).map((performance) => performance.date)),
  ].sort();
  const visibleArtists = artistsQuery.data?.filter(
    (artist) =>
      (selectedDate === MY_ARTISTS && (tagsByArtist.get(artist.id)?.length ?? 0) > 0) ||
      (selectedDate !== MY_ARTISTS &&
        performancesByArtist
          .get(artist.id)
          ?.some((performance) => performance.date === selectedDate))
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

  useEffect(() => {
    audioRef.current?.pause();
    setCurrentTrackIndex(0);
    setIsPlaying(false);
    setHasStartedPlayback(false);
  }, [selectedArtist?.id]);

  const selectedArtistTracks = tracksQuery.data ?? [];
  const currentTrack = selectedArtistTracks[currentTrackIndex] ?? null;
  const canPlay = tracksQuery.isSuccess && selectedArtistTracks.length > 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.load();

    if (!isPlaying) return;
    if (!currentTrack?.previewUrl) return;

    void audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack?.previewUrl, currentTrack?.uri, isPlaying]);

  function disconnectSpotify() {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => window.history.replaceState({}, "", window.location.pathname),
    });
  }

  function changeTrack(offset: number) {
    if (selectedArtistTracks.length < 2) return;

    setCurrentTrackIndex(
      (index) => (index + offset + selectedArtistTracks.length) % selectedArtistTracks.length
    );
  }

  function togglePlayback() {
    if (!canPlay) return;

    setHasStartedPlayback(true);
    setIsPlaying((playing) => !playing);
  }

  function toggleFavorite() {
    if (!currentTrack) return;

    setFavoriteTrackUris((favorites) => {
      const nextFavorites = new Set(favorites);
      if (nextFavorites.has(currentTrack.uri)) {
        nextFavorites.delete(currentTrack.uri);
      } else {
        nextFavorites.add(currentTrack.uri);
      }
      return nextFavorites;
    });
  }

  const selectedArtistPerformances = selectedArtist
    ? (performancesByArtist.get(selectedArtist.id) ?? [])
    : [];
  const selectedArtistTags = selectedArtist ? (tagsByArtist.get(selectedArtist.id) ?? []) : [];
  const selectedArtistThumbnail = selectedArtist ? getThumbnail(selectedArtist.images) : null;
  const selectedArtistLinks = selectedArtist
    ? [
        { label: "Spotify", url: selectedArtist.spotifyUrl },
        { label: "Instagram", url: selectedArtist.instagramUrl },
        { label: "YouTube", url: selectedArtist.youtubeUrl },
      ].filter((link): link is { label: string; url: string } => Boolean(link.url))
    : [];
  const isCurrentTrackFavorite = currentTrack ? favoriteTrackUris.has(currentTrack.uri) : false;

  return (
    <main className="min-h-svh p-6">
      <div className="mx-auto flex w-full max-w-8xl flex-col gap-6">
        {statusQuery.data?.connected ? (
          <div className="flex justify-end">
            <Popover>
              <PopoverTrigger
                aria-label={`Open account menu for ${profileName}`}
                render={<Button variant="outline" size="lg" className="rounded-full pr-0.5" />}
              >
                <span>{profileName}</span>
                <Avatar size="sm" className="mx-1">
                  {profileImage ? <AvatarImage src={profileImage} alt="" /> : null}
                  <AvatarFallback>{getInitials(profileName)}</AvatarFallback>
                </Avatar>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48">
                <Button
                  variant="destructive"
                  disabled={disconnectMutation.isPending}
                  onClick={disconnectSpotify}
                  className="w-full justify-start"
                >
                  {disconnectMutation.isPending ? "Disconnecting…" : `Disconnect ${profileName}`}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}

        {!statusQuery.data?.connected ? (
          <div className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
            <Card className="w-full max-w-[300px]">
              <CardHeader className="text-center">
                <CardTitle>Spotify</CardTitle>
                <CardDescription>Connect your account to personalize Outside Jams.</CardDescription>
              </CardHeader>
              <CardFooter className="justify-center">
                <Button onClick={() => window.location.assign("/api/auth/spotify")}>
                  Connect Spotify
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : null}

        {statusQuery.data?.connected ? (
          <Card>
            <CardHeader>
              {/*<CardTitle>Artists</CardTitle>
              <CardDescription>Outside Lands 2026 artists.</CardDescription>*/}
            </CardHeader>
            <CardContent>
              <Tabs value={selectedDate} onValueChange={(value) => setSelectedDate(String(value))}>
                <div className="flex w-full justify-center pb-12">
                  <TabsList size="lg">
                    <TabsTrigger value={MY_ARTISTS}>
                      <Avatar size="sm">
                        {profileImage ? <AvatarImage src={profileImage} alt="" /> : null}
                        <AvatarFallback>{getInitials(profileName)}</AvatarFallback>
                      </Avatar>
                      My Artists
                    </TabsTrigger>
                    {performanceDates.map((date) => (
                      <TabsTrigger key={date} value={date}>
                        {weekdayFormatter.format(parseDateOnly(date))}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <TabsContent value={selectedDate}>
                  {selectedDate === MY_ARTISTS && isSyncInProgress ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="flex min-h-64 items-center justify-center text-center text-muted-foreground"
                    >
                      Finding your Spotify artists who are performing...
                    </p>
                  ) : artistsQuery.isError ? (
                    <p role="alert" className="text-destructive">
                      Unable to load artists. Please try again later.
                    </p>
                  ) : selectedDate === MY_ARTISTS &&
                    tagsQuery.isSuccess &&
                    visibleArtists?.length === 0 ? (
                    <Empty className="min-h-64">
                      <EmptyHeader>
                        <EmptyDescription>
                          None of your Spotify artists are performing :( Let&apos;s change that!
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : visibleArtists ? (
                    <div className="flex flex-col gap-3">
                      {tagsQuery.isError ? (
                        <p role="alert" className="text-destructive">
                          Unable to load your artist tags.
                        </p>
                      ) : null}
                      <ItemGroup
                        role="group"
                        aria-label="Artists"
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                      >
                        {visibleArtists.map((artist) => {
                          const thumbnail = getThumbnail(artist.images);
                          const artistTags = tagsByArtist.get(artist.id) ?? [];
                          const performanceSummary = performancesByArtist
                            .get(artist.id)
                            ?.map(formatPerformance)
                            .join(", ");

                          return (
                            <Item
                              key={artist.id}
                              render={<button type="button" />}
                              variant="outline"
                              className="items-stretch gap-0 overflow-hidden p-0 text-left hover:bg-muted"
                              aria-label={`View details for ${artist.name}`}
                              onClick={() => setSelectedArtist(artist)}
                            >
                              <ItemHeader className="relative aspect-square w-full overflow-hidden bg-muted">
                                {thumbnail ? (
                                  <img
                                    src={thumbnail.url}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="flex size-full items-center justify-center text-sm font-medium text-muted-foreground"
                                  >
                                    {getInitials(artist.name)}
                                  </span>
                                )}
                                {artistTags.length > 0 ? (
                                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 p-3">
                                    {artistTags.map((tag) => (
                                      <Badge key={tag} variant="secondary">
                                        {formatTag(tag)}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                              </ItemHeader>
                              <ItemContent className="p-3">
                                <ItemTitle>{artist.name}</ItemTitle>
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

      <Drawer
        modal={false}
        showSwipeHandle
        disablePointerDismissal
        open={selectedArtist !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedArtist(null);
        }}
      >
        <DrawerContent data-inverse-theme>
          {selectedArtist ? (
            <div className="relative mx-auto grid w-full max-w-8xl grid-cols-6 gap-6 px-6 py-8 sm:px-12">
              <section className="col-span-6 flex min-w-0 flex-col gap-6 sm:col-span-3 sm:flex-row sm:items-center">
                <div className="size-28 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-36">
                  {selectedArtistThumbnail ? (
                    <img
                      src={selectedArtistThumbnail.url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-full items-center justify-center text-lg font-medium text-muted-foreground"
                    >
                      {getInitials(selectedArtist.name)}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <DrawerHeader className="p-0 group-data-[swipe-axis=y]/drawer-popup:text-left">
                    <p className="min-h-5 truncate text-sm font-medium" aria-live="polite">
                      {hasStartedPlayback ? currentTrack?.name : null}
                    </p>
                    <DrawerTitle className="text-xl">{selectedArtist.name}</DrawerTitle>
                    <DrawerDescription>
                      {selectedArtistPerformances.length > 0
                        ? selectedArtistPerformances.map(formatPerformanceDetails).join(", ")
                        : "Performance details are not available."}
                    </DrawerDescription>
                  </DrawerHeader>

                  {selectedArtistTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedArtistTags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {formatTag(tag)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {selectedArtistLinks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedArtistLinks.map((link) => (
                        <Button
                          key={link.label}
                          variant="outline"
                          render={<a href={link.url} target="_blank" rel="noreferrer" />}
                        >
                          {link.label}
                          <ExternalLink data-icon="inline-end" />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>

              <div className="col-span-6 flex items-center justify-center sm:col-span-3">
                <div className="flex items-center gap-3" role="group" aria-label="Player controls">
                  <Button
                    variant="ghost"
                    size="icon-xl"
                    aria-label="Previous track"
                    disabled={selectedArtistTracks.length < 2}
                    onClick={() => changeTrack(-1)}
                  >
                    <SkipBack strokeWidth={2.75} />
                  </Button>
                  <Button
                    size="icon-xl"
                    variant="outline"
                    className="rounded-full w-20"
                    aria-label={isPlaying ? "Pause track" : "Play track"}
                    aria-pressed={isPlaying}
                    disabled={!canPlay}
                    onClick={togglePlayback}
                  >
                    {isPlaying ? <Pause strokeWidth={2.75} /> : <Play strokeWidth={2.75} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xl"
                    aria-label="Next track"
                    disabled={selectedArtistTracks.length < 2}
                    onClick={() => changeTrack(1)}
                  >
                    <SkipForward strokeWidth={2.75} />
                  </Button>
                  <Button
                    variant={isCurrentTrackFavorite ? "secondary" : "ghost"}
                    size="icon-xl"
                    aria-label={
                      isCurrentTrackFavorite ? "Remove track from favorites" : "Favorite track"
                    }
                    aria-pressed={isCurrentTrackFavorite}
                    disabled={!currentTrack}
                    onClick={toggleFavorite}
                  >
                    <Heart
                      className={cn(isCurrentTrackFavorite && "fill-current")}
                      strokeWidth={2.75}
                    />
                  </Button>
                </div>
                <audio
                  ref={audioRef}
                  src={currentTrack?.previewUrl ?? undefined}
                  onEnded={() => {
                    if (selectedArtistTracks.length > 1) {
                      changeTrack(1);
                    } else {
                      setIsPlaying(false);
                    }
                  }}
                />
              </div>

              <DrawerClose
                aria-label="Close artist details"
                render={<Button variant="ghost" size="icon" className="absolute top-4 right-4" />}
              >
                <X />
              </DrawerClose>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </main>
  );
}
