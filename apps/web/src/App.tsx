import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HelloResponse = {
  message: string;
};

export default function App() {
  const [message, setMessage] = useState("Loading…");

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json() as Promise<HelloResponse>;
      })
      .then(({ message }) => setMessage(message))
      .catch(() => setMessage("Unable to reach the API"));
  }, []);

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>API response</CardTitle>
          <CardDescription>GET /api/hello</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}
