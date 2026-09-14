import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProducts, createProduct, updateProduct, deleteProduct, adjustStock, getStockMovements,
  getServices, createService, updateService, deleteService,
  getStaff, createStaff, updateStaff, deleteStaff,
  getBusinessHours, saveBusinessHours,
  getServiceStaffMap, setServiceStaff,
  getStaffHours, saveStaffHours,
} from "@/actions/catalogue";

function crud(key, fn) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fn,
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };
}

function crudWithId(key, fn) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, updates }) => fn(id, updates),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };
}

/* products */
export function useProducts(filters) {
  return useQuery({ queryKey: ["products", filters], queryFn: () => getProducts(filters) });
}
export const useCreateProduct = crud("products", createProduct);
export const useUpdateProduct = crudWithId("products", updateProduct);
export const useDeleteProduct = crud("products", deleteProduct);
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
  });
}
export function useStockMovements(productId) {
  return useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: () => getStockMovements(productId),
    enabled: Boolean(productId),
  });
}

/* services */
export function useServices(filters) {
  return useQuery({ queryKey: ["services", filters], queryFn: () => getServices(filters) });
}
export const useCreateService = crud("services", createService);
export const useUpdateService = crudWithId("services", updateService);
export const useDeleteService = crud("services", deleteService);

/* staff */
export function useStaff() {
  return useQuery({ queryKey: ["staff"], queryFn: getStaff });
}
export const useCreateStaff = crud("staff", createStaff);
export const useUpdateStaff = crudWithId("staff", updateStaff);
export const useDeleteStaff = crud("staff", deleteStaff);

/* service ↔ staff */
export function useServiceStaffMap() {
  return useQuery({ queryKey: ["service-staff"], queryFn: getServiceStaffMap });
}
export function useSetServiceStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, staffIds }) => setServiceStaff(serviceId, staffIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-staff"] }),
  });
}

/* staff shifts */
export function useStaffHours(staffId) {
  return useQuery({
    queryKey: ["staff-hours", staffId],
    queryFn: () => getStaffHours(staffId),
    enabled: Boolean(staffId),
  });
}
export function useSaveStaffHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, rows }) => saveStaffHours(staffId, rows),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["staff-hours", v.staffId] }),
  });
}

/* hours */
export function useBusinessHours() {
  return useQuery({ queryKey: ["business-hours"], queryFn: getBusinessHours });
}
export const useSaveBusinessHours = crud("business-hours", saveBusinessHours);
