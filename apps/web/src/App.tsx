import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SpotifyStatus = {
  connected: boolean;
  displayName?: string;
};

export default function App() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const callbackResult = new URLSearchParams(window.location.search).get("spotify");
  const callbackError =
    callbackResult === "denied"
      ? "Spotify connection was cancelled."
      : callbackResult === "error"
        ? "Spotify could not be connected. Please try again."
        : null;
  const [error, setError] = useState<string | null>(callbackError);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/spotify/status", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json() as Promise<SpotifyStatus>;
      })
      .then(setStatus)
      .catch(() => setError("Unable to check your Spotify connection."));
  }, []);

  async function disconnectSpotify() {
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/spotify", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Request failed");
      setStatus({ connected: false });
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setError("Spotify could not be disconnected. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Spotify</CardTitle>
          <CardDescription>Connect your account to personalize Outside Jams.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : status?.connected ? (
            <p>
              Connected as <strong>{status.displayName}</strong>
            </p>
          ) : status ? (
            <p className="text-muted-foreground">No Spotify account connected.</p>
          ) : (
            <p className="text-muted-foreground">Checking connection…</p>
          )}
        </CardContent>
        <CardFooter>
          {status?.connected ? (
            <Button variant="destructive" disabled={disconnecting} onClick={disconnectSpotify}>
              {disconnecting ? "Disconnecting…" : "Disconnect Spotify"}
            </Button>
          ) : (
            <Button onClick={() => window.location.assign("/api/auth/spotify")}>
              Connect Spotify
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
