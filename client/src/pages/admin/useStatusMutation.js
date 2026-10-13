import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { appointmentsApi, errorMessage } from '../../lib/api';
import { STATUS_LABELS } from '../../lib/format';

export function useStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => appointmentsApi.updateStatus(id, { status }),
    onSuccess: (appt) => {
      toast.success(`Marked as ${STATUS_LABELS[appt.status].toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['admin-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
