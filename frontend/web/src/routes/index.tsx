import { Button } from "@/components/ui/button";
import { useCreateRoom } from "@/hooks/useCreateRoom";
import { createFileRoute } from "@tanstack/react-router";
import { PhoneOutgoing } from "lucide-react";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const { mutate: create, isPending } = useCreateRoom();

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center gap-4 p-4">
      <div className="h-screen w-full flex flex-col items-center justify-center">
        <h1
          className="text-6xl font-extrabold bg-linear-to-br from-rose-700 to-red-950 bg-clip-text text-transparent"
          style={{ WebkitTextStroke: "1px rgba(255,255,255,0.8)" }}
        >
          MEGASERVER
        </h1>
        <Button
          className="mt-4"
          variant="default"
          onClick={() => create()}
          disabled={isPending}
        >
          start a call <PhoneOutgoing />
        </Button>
      </div>
    </div>
  );
}
