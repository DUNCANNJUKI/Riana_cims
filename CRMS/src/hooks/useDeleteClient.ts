import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useDeleteClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/crms/clients/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to delete client.');
      }
      return { id };
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Array<{ id: string }>>(['clients'], (current = []) => current.filter((client) => client.id !== id));
      queryClient.invalidateQueries({ queryKey: ['clients'], refetchType: 'active' });
    },
  });
}
