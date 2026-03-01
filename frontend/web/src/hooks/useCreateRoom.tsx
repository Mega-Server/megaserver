import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

export const useCreateRoom = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => api.post<{ room_id: string }>("/create"),
    onSuccess: ({ room_id }) => {
      navigate({ to: "/room/$roomId", params: { roomId: room_id } });
    },
  });
};
