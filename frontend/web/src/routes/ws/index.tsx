import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/ws/")({
  component: Page,
});

function Page() {
  const navigate = useNavigate({ from: "/ws/" });

  const create = async () => {
    const resp = await fetch("http://localhost:4000/create");
    const { room_id } = await resp.json();

    if (resp.ok) {
      navigate({ to: "/ws/room/$roomId", params: { roomId: room_id } });
    }
  };

  return (
    <div>
      Hello "/ws/"!
      <Button onClick={create}>Create Room</Button>
    </div>
  );
}
