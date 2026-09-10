import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shared React Query hook for fetching all sales dashboard data via the
 * getSalesDashboardData backend function (which uses asServiceRole to
 * bypass RLS — sales reps without platform tokens can't read entities
 * directly).
 *
 * All components using this hook with the same salesMemberId share a
 * single cached request (React Query deduplicates by query key).
 */
export function useSalesDashboardData(salesMemberId) {
  return useQuery({
    queryKey: ['salesDashboardData', salesMemberId],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSalesDashboardData', {
        sales_member_id: salesMemberId,
      });
      return result?.data || result;
    },
    enabled: !!salesMemberId,
    staleTime: 30000, // 30 seconds — prevents refetch spam when switching tabs
    refetchOnWindowFocus: false,
  });
}