import {
  type ArtistImage,
  useArtistsQuery,
  useDisconnectSpotifyMutation,
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
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";

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

export default function App() {
  const callbackResult = new URLSearchParams(window.location.search).get("spotify");
  const callbackError =
    callbackResult === "denied"
      ? "Spotify connection was cancelled."
      : callbackResult === "error"
        ? "Spotify could not be connected. Please try again."
        : null;
  const statusQuery = useSpotifyStatusQuery();
  const artistsQuery = useArtistsQuery();
  const disconnectMutation = useDisconnectSpotifyMutation();
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
              {artistsQuery.isError ? (
                <p role="alert" className="text-destructive">
                  Unable to load artists. Please try again later.
                </p>
              ) : artistsQuery.data ? (
                <ItemGroup className="grid gap-3 sm:grid-cols-2">
                  {artistsQuery.data.map((artist) => {
                    const thumbnail = getThumbnail(artist.images);

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
                        </ItemContent>
                      </Item>
                    );
                  })}
                </ItemGroup>
              ) : (
                <p className="text-muted-foreground">Loading artists…</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
